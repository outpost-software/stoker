import { execFileSync } from "node:child_process"
import { firebaseEmulators, resolveProject } from "./project.js"

const EMULATOR_PROCESS =
    /cloud-firestore-emulator|firebase-database-emulator|cloud-pubsub-emulator|cloud-storage-rules-runtime|firebase-tools|emulators:start/

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const missing = new Set<string>()

const run = (command: string, args: string[]): string => {
    try {
        return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") missing.add(command)
        return ""
    }
}

const isAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

const isWindows = process.platform === "win32"

export const parseNetstat = (output: string, port: number): number[] =>
    output
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .filter(
            (columns) =>
                /^TCP$/i.test(columns[0] ?? "") &&
                /^LISTENING$/i.test(columns[3] ?? "") &&
                columns[1]?.endsWith(`:${port}`),
        )
        .map((columns) => parseInt(columns[4]))
        .filter((pid) => !isNaN(pid))

const listeningPids = (port: number): number[] => {
    if (isWindows) return parseNetstat(run("netstat", ["-ano"]), port)
    return run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
        .split("\n")
        .map((line) => parseInt(line))
        .filter((pid) => !isNaN(pid))
}

const commandOf = (pid: number): string =>
    isWindows
        ? run("powershell", [
              "-NoProfile",
              "-Command",
              `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
          ]).trim()
        : run("ps", ["-o", "command=", "-p", String(pid)]).trim()

const declaredPorts = (rootDir: string): number[] =>
    Object.values(firebaseEmulators(rootDir))
        .map((emulator) => emulator.port)
        .filter((port): port is number => typeof port === "number")

export const snapshotPreexistingPorts = (rootDir: string): void => {
    const occupied = declaredPorts(rootDir).filter((port) => listeningPids(port).length > 0)
    process.env.STOKER_TEST_PREEXISTING_PORTS = JSON.stringify(occupied)
}

const teardown = async (): Promise<void> => {
    const { rootDir } = resolveProject()
    const preexisting = new Set<number>(JSON.parse(process.env.STOKER_TEST_PREEXISTING_PORTS ?? "[]"))
    const exited: string[] = []

    for (const port of declaredPorts(rootDir).filter((port) => !preexisting.has(port))) {
        for (const pid of listeningPids(port)) {
            const command = commandOf(pid)
            if (!EMULATOR_PROCESS.test(command)) continue

            process.kill(pid, "SIGTERM")
            for (let waited = 0; waited < 2000 && isAlive(pid); waited += 100) await sleep(100)
            if (isAlive(pid)) process.kill(pid, "SIGKILL")
            exited.push(String(pid))
        }
    }

    if (exited.length) {
        console.log(`Exited ${exited.length} emulator(s):\n  ${exited.join("\n  ")}`)
    }
    if (missing.size) {
        console.warn(`Cannot exit emulator(s): ${[...missing].join(", ")} not found on PATH.`)
    }
}

export default teardown
