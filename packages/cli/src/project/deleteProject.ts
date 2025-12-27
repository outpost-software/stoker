import { runChildProcess } from "@stoker-platform/node-client"
import { readFile, rm, unlink, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"

export const deleteProject = async (options: { testMode?: boolean }) => {
    if (!process.env.GCP_PROJECT) {
        throw new Error("GCP_PROJECT is not set.")
    }
    await runChildProcess("gcloud", ["projects", "delete", process.env.GCP_PROJECT, "--quiet"]).catch(() => {
        throw new Error("Error deleting project.")
    })
    console.log("Project deleted.")

    if (!options.testMode) {
        const projectData = JSON.parse(await readFile(join(process.cwd(), "project-data.json"), "utf8"))
        projectData.projects = projectData.projects.filter((project: string) => project !== process.env.GCP_PROJECT)
        projectData.deleted_projects.push(process.env.GCP_PROJECT)
        await writeFile(join(process.cwd(), "project-data.json"), JSON.stringify(projectData, null, 4))
        console.log("Project deleted from project data.")
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(join(process.cwd(), ".env", `.env.${process.env.GCP_PROJECT}`))) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await unlink(join(process.cwd(), ".env", `.env.${process.env.GCP_PROJECT}`))
        console.log("System environment file deleted.")
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(join(process.cwd(), ".env", `.env.project.${process.env.GCP_PROJECT}`))) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await unlink(join(process.cwd(), ".env", `.env.project.${process.env.GCP_PROJECT}`))
        console.log("Project environment file deleted.")
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(join(process.cwd(), ".migration", process.env.GCP_PROJECT))) {
        await rm(join(process.cwd(), ".migration", process.env.GCP_PROJECT), { recursive: true, force: true })
        console.log("Project migration folder deleted.")
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const firebaserc = JSON.parse(await readFile(join(process.cwd(), ".firebaserc"), "utf8"))
    if (firebaserc.targets) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        delete firebaserc.targets[process.env.GCP_PROJECT!]
        console.log("Project removed from .firebaserc targets.")
    }
    if (firebaserc.etags) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        delete firebaserc.etags[process.env.GCP_PROJECT!]
        console.log("Project removed from .firebaserc etags.")
    }
    await writeFile(join(process.cwd(), ".firebaserc"), JSON.stringify(firebaserc, null, 2))

    process.exit()
}
