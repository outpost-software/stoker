import type { ReactNode } from "react"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Layout from "@theme/Layout"
import HomepageFeatures from "@site/src/components/HomepageFeatures"
import Heading from "@theme/Heading"

import styles from "./index.module.css"

function HomepageHeader() {
    const { siteConfig } = useDocusaurusContext()
    return (
        <header className={clsx("hero hero--primary", styles.heroBanner)}>
            <div className="container">
                <img src="/img/Stoker Logo.png" alt="Stoker" width={500} />
                <div>
                    <p className={styles.tagline}>Build realtime, offline-ready internal tools.<br></br>Optionally ship them as highly scalable, multi-tenant SaaS products.</p>
                </div>
                <div className={styles.buttons}>
                    <Link className="button button--secondary button--lg" to="/docs/Getting Started">
                        Read the docs
                    </Link>
                </div>
                <p className={styles.free}>Free for development and evaluation*</p>
            </div>
        </header>
    )
}

export default function Home(): ReactNode {
    const { siteConfig } = useDocusaurusContext()
    return (
        <Layout title={siteConfig.title} description="Description will go into a meta tag in <head />">
            <HomepageHeader />
            <main>
                <HomepageFeatures />
                <p style={{ textAlign: "center", paddingLeft: "15%", paddingRight: "15%" }}>
                    * You'll need to purchase a commercial license to use Stoker in production. That said, feel free to
                    try it out during development to see if it's a good fit for your needs. Please see the included
                    license for full details.
                </p>
            </main>
            <div className={styles.dashboardImage}>
                <div className={styles.dashboardImageContainer}>
                    <img src="/img/dashboard-dark.png" alt="Stoker Dashboard" />
                    <img src="/img/list-dark.png" alt="Stoker List" />
                    <img src="/img/board-dark.png" alt="Stoker Board" />
                    <img src="/img/map-light.png" alt="Stoker Map" />
                    <img src="/img/list-light.png" alt="Stoker List" />
                    <img src="/img/ai.png" alt="Stoker AI Chat" />
                </div>
            </div>
        </Layout>
    )
}
