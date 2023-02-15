/* eslint-disable @typescript-eslint/no-non-null-assertion */ import Fastify from "fastify";
import { verifyKey } from "discord-interactions";
import { Routes, InteractionType, InteractionResponseType } from "discord-api-types/v10";
import { REST } from "@discordjs/rest";
import { codeBlock, SlashCommandBuilder } from "@discordjs/builders";
import { fork } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { once } from "events";
import { PassThrough } from "stream";
import getStream from "get-stream";
const __dirname = dirname(fileURLToPath(import.meta.url));
async function childClose(child) {
    const [, stdoutEncoded, stderrEncoded] = await Promise.all([
        once(child, "close"),
        getStream(child.stdout ?? new PassThrough()),
        getStream(child.stderr ?? new PassThrough())
    ]);
    return {
        ...child,
        stdoutEncoded: stdoutEncoded,
        stderrEncoded: stderrEncoded
    };
}
async function main() {
    const fastify = Fastify();
    await fastify.register(import("fastify-raw-body"));
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    // change when deploying
    if (false) {
        rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
            body: [
                new SlashCommandBuilder().setName("execute").setDescription("Executes code in a programming language").addSubcommand((s)=>s.setName("luau").setDescription("Executes luau code").addStringOption((s)=>s.setName("code").setDescription("The code to run").setRequired(true))).toJSON()
            ]
        });
    }
    fastify.route({
        url: "/interactions",
        method: "POST",
        config: {
            rawBody: true
        },
        schema: {
            headers: {
                type: "object",
                properties: {
                    "x-signature-ed25519": {
                        type: "string"
                    },
                    "x-signature-timestamp": {
                        type: "string"
                    }
                }
            }
        },
        preHandler: [
            (req, _, done)=>{
                // console.dir(req, { depth: Infinity })
                if (!req.rawBody || !verifyKey(req.rawBody, req.headers["x-signature-ed25519"], req.headers["x-signature-timestamp"], process.env.DISCORD_PUBLIC_KEY)) {
                    const error = new Error();
                    error.statusCode = 400;
                    error.message = "Invalid request";
                    done(error);
                }
                done();
            }
        ],
        handler: async (req, res)=>{
            if (req.body.type === InteractionType.Ping) {
                return {
                    type: InteractionResponseType.Pong
                };
            } else if (req.body.type === InteractionType.ApplicationCommand) {
                if (!("options" in req.body.data)) throw new Error("Unexpected interaction");
                res.send({
                    type: InteractionResponseType.DeferredChannelMessageWithSource
                });
                const { name: language , options  } = req.body.data.options?.[0] ?? {};
                if (!language || language !== "luau") throw new Error("Unexpected option");
                const code = (options?.[0])?.value;
                if (!code) throw new Error("Unexpected option");
                const child = fork(join(__dirname, "languages", "luau.js"), [
                    code
                ], {
                    silent: true
                });
                const { stdoutEncoded , stderrEncoded  } = await childClose(child);
                let string = "";
                if (stdoutEncoded) string += `📝 Logs:\n${stdoutEncoded}\n`;
                if (stderrEncoded) string += `❌ Errors:\n${stderrEncoded}\n`;
                rest.patch(Routes.webhookMessage(process.env.DISCORD_CLIENT_ID, req.body.token), {
                    body: {
                        content: codeBlock(string)
                    }
                });
            }
            throw new Error("Unhandled");
        }
    });
    fastify.listen({
        host: process.env.SERVER_ADDRESS ?? "127.0.0.1",
        port: parseInt(process.env.PORT ?? "2944")
    }).then(console.log);
}
main();
