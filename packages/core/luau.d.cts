import "@types/emscripten"

declare function cwrap<
	I extends Array<Emscripten.JSType | null> | [],
	R extends Emscripten.JSType | null
>(
	ident: string,
	returnType: R,
	argTypes: I,
	opts?: Emscripten.CCallOpts
): (...arg: ArgsToType<I>) => ReturnToType<R>

declare function ccall<
	I extends Array<Emscripten.JSType | null> | [],
	R extends Emscripten.JSType | null
>(
	ident: string,
	returnType: R,
	argTypes: I,
	args: ArgsToType<I>,
	opts?: Emscripten.CCallOpts
): ReturnToType<R>

declare function print(str: string): void

interface LuauModule extends EmscriptenModule {
	ccall: typeof ccall<["string"], "string">
	cwrap: typeof cwrap<["string"], "string">
	print: typeof print
	printErr: typeof print
}

declare module "luau.cjs" {
	export default LuauModule
}
