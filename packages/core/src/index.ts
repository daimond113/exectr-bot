/* eslint-disable @typescript-eslint/no-non-null-assertion */
import Fastify, { type FastifyError } from "fastify"
import { verifyKey } from "discord-interactions"
import {
	APIInteraction,
	APIInteractionResponse,
	RESTPostAPIChatInputApplicationCommandsJSONBody,
	APIApplicationCommandSubcommandOption,
	APIApplicationCommandOptionChoice,
	ApplicationCommandType,
} from "discord-api-types/v10"
import {
	Routes,
	InteractionType,
	InteractionResponseType,
} from "discord-api-types/v10"
import { REST } from "@discordjs/rest"
import {
	codeBlock,
	ContextMenuCommandBuilder,
	SlashCommandBuilder,
} from "@discordjs/builders"
import { type ChildProcess, fork } from "child_process"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { once } from "events"
import { PassThrough } from "stream"
import getStream from "get-stream"

const __dirname = dirname(fileURLToPath(import.meta.url))
const luauLanguageFile = join(__dirname, "languages", "luau.js")

type ClosedChildProcess = Pick<ChildProcess, "exitCode" | "signalCode"> & {
	stdoutEncoded: string
	stderrEncoded: string
}

async function childClose(child: ChildProcess): Promise<ClosedChildProcess> {
	const [, stdoutEncoded, stderrEncoded] = await Promise.all([
		once(child, "close"),
		getStream(child.stdout ?? new PassThrough()),
		getStream(child.stderr ?? new PassThrough()),
	])
	return {
		...child,
		stdoutEncoded: stdoutEncoded as string,
		stderrEncoded: stderrEncoded as string,
	}
}

async function main() {
	const fastify = Fastify()

	await fastify.register(import("fastify-raw-body"))

	const rest = new REST().setToken(process.env.DISCORD_TOKEN!)

	// change when deploying
	if (false) {
		rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
			body: [
				new SlashCommandBuilder()
					.setName("execute")
					.setDescription("Executes code in a programming language")
					.addSubcommand((s) =>
						s
							.setName("luau")
							.setDescription("Executes luau code")
							.addStringOption((s) =>
								s
									.setName("code")
									.setDescription("The code to run")
									.setRequired(true)
							)
					)
					.toJSON(),
				new ContextMenuCommandBuilder()
					.setName("Execute Luau")
					.setType(ApplicationCommandType.Message),
			] as RESTPostAPIChatInputApplicationCommandsJSONBody[],
		})
	}

	fastify.route<{
		Headers: {
			"x-signature-ed25519": string
			"x-signature-timestamp": string
		}
		Body: APIInteraction
		Reply: APIInteractionResponse
	}>({
		url: "/interactions",
		method: "POST",
		config: {
			rawBody: true,
		},
		schema: {
			headers: {
				type: "object",
				properties: {
					"x-signature-ed25519": { type: "string" },
					"x-signature-timestamp": { type: "string" },
				},
			},
		},
		preHandler: [
			(req, _, done) => {
				// console.dir(req, { depth: Infinity })
				if (
					!req.rawBody ||
					!verifyKey(
						req.rawBody,
						req.headers["x-signature-ed25519"],
						req.headers["x-signature-timestamp"],
						process.env.DISCORD_PUBLIC_KEY!
					)
				) {
					const error = new Error() as FastifyError
					error.statusCode = 400
					error.message = "Invalid request"
					done(error)
				}
				done()
			},
		],
		handler: async (req, res) => {
			const respondURL = Routes.webhookMessage(
				process.env.DISCORD_CLIENT_ID!,
				req.body.token
			)
			const executeLuau = async (code: string) => {
				const child = fork(luauLanguageFile, [code], {
					silent: true,
				})
				const { stdoutEncoded, stderrEncoded } = await childClose(child)

				let string = ""
				if (stdoutEncoded) string += `📝 Logs:\n${stdoutEncoded}\n`
				if (stderrEncoded) string += `❌ Errors:\n${stderrEncoded}\n`
				rest.patch(respondURL, {
					body: {
						content: codeBlock(string),
					},
				})
			}

			if (req.body.type === InteractionType.Ping) {
				return { type: InteractionResponseType.Pong }
			}

			res.send({
				type: InteractionResponseType.DeferredChannelMessageWithSource,
			})

			if (req.body.type === InteractionType.ApplicationCommand) {
				if (req.body.data.type === ApplicationCommandType.ChatInput) {
					const { name: language, options } = (req.body.data.options?.[0] ??
						{}) as APIApplicationCommandSubcommandOption
					if (!language || language !== "luau")
						throw new Error("Unexpected option")

					const code = (
						options?.[0] as
							| APIApplicationCommandOptionChoice<string>
							| undefined
					)?.value
					if (!code) throw new Error("Unexpected option")

					await executeLuau(code)
				} else if (req.body.data.type === ApplicationCommandType.Message) {
					const { content: rawCode } =
						req.body.data.resolved.messages[req.body.data.target_id]
					const code =
						/```(?:([\w-]+)\n)?([\s\S]*?)```/gm.exec(rawCode)?.[2] ?? rawCode

					await executeLuau(code)
				}
			}

			rest.patch(respondURL, {
				body: {
					content: "Unexpected interaction",
				},
			})

			throw new Error("Unhandled")
		},
	})

	fastify
		.listen({
			host: process.env.SERVER_ADDRESS ?? "127.0.0.1",
			port: parseInt(process.env.PORT ?? "2944"),
		})
		.then(console.log)
}
main()
