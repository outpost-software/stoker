import spawn from "cross-spawn"

export const runChildProcess = async (
    command: string,
    args: string[],
    cwd?: string,
    env?: NodeJS.ProcessEnv,
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: cwd || process.cwd(), env: { ...process.env, ...env } })

        let stdout = ""

        const handleSIGINT = () => {
            child.kill("SIGINT")
        }
        const handleSIGTERM = () => {
            child.kill("SIGTERM")
        }

        const cleanup = () => {
            process.removeListener("SIGINT", handleSIGINT)
            process.removeListener("SIGTERM", handleSIGTERM)
        }

        child.stdout?.on("data", (data) => {
            stdout += data.toString()
            console.log(data.toString())
        })
        child.stderr?.on("data", (error) => {
            console.log(error.toString())
        })
        child.on("exit", (code) => {
            cleanup()
            if (code === 0) resolve(stdout)
            else reject()
        })
        process.on("SIGINT", handleSIGINT)
        process.on("SIGTERM", handleSIGTERM)
    })
}
