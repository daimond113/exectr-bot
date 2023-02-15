// @ts-check
import { createWriteStream } from "fs"
import { join } from "path"
import fetch from "node-fetch"

const luauPath = join(process.cwd(), "luau.cjs")

const stream = createWriteStream(luauPath)

await fetch(
	"https://github.com/Roblox/luau/releases/latest/download/Luau.Web.js"
).then((r) => r.body?.pipe(stream))
