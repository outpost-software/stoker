import type { ReactNode } from "react"
import clsx from "clsx"
import Heading from "@theme/Heading"
import styles from "./styles.module.css"

type FeatureItem = {
    title: string
    Svg: React.ComponentType<React.ComponentProps<"svg">>
    description: ReactNode
}

const FeatureList: FeatureItem[] = [
    {
        title: "Config First",
        Svg: require("@site/static/img/undraw_hacker-mindset.svg").default,
        description: (
            <>
                Build complex internal tools by writing simple TypeScript config files. Use code to extend or customize
                your apps.
            </>
        ),
    },
    {
        title: "Realtime Second",
        Svg: require("@site/static/img/undraw_real-time-sync.svg").default,
        description: (
            <>
                Apps are realtime by default and lightning fast thanks to{" "}
                <a href="https://firebase.google.com/docs/firestore" target="_blank">
                    Cloud Firestore
                </a>
                .
            </>
        ),
    },
    {
        title: "Offline Third",
        Svg: require("@site/static/img/undraw_connection-lost.svg").default,
        description: <>Offline mode comes standard. Ideal for building tools for field service companies.</>,
    },
    {
        title: "Multi Tenant",
        Svg: require("@site/static/img/undraw_users-per-minute.svg").default,
        description: <>Easily add tenants to your app with a simple CLI command.</>,
    },
    {
        title: "AI Ready",
        Svg: require("@site/static/img/undraw_mcp-server.svg").default,
        description: <>Store embeddings and optionally enable RAG-powered chatbots.</>,
    },
    {
        title: "Access Control Presets",
        Svg: require("@site/static/img/undraw_security-on.svg").default,
        description: <>Define simple access control rules in your config files. Customize with code when needed.</>,
    },
    {
        title: "Automated Back End",
        Svg: require("@site/static/img/undraw_server-status.svg").default,
        description: (
            <>Built on Google Cloud projects that you control. Only you have access to your cloud resources.</>
        ),
    },
    {
        title: "Headless CMS",
        Svg: require("@site/static/img/undraw_connected-world.svg").default,
        description: (
            <>Stoker gives you a headless CMS with web and Node SDKs, as well as a Cloud Functions based API.</>
        ),
    },
    {
        title: "Built Over Years",
        Svg: require("@site/static/img/undraw_app-dark-mode.svg").default,
        description: <>12+ years of experience building internal tools. 2,000+ commits. 55,000+ lines of code.</>,
    },
]

function Feature({ title, Svg, description }: FeatureItem) {
    return (
        <div className={clsx("col col--4")}>
            <div className="text--center">
                <Svg className={styles.featureSvg} role="img" />
            </div>
            <div className="text--center padding-horiz--md">
                <Heading as="h3">{title}</Heading>
                <p>{description}</p>
            </div>
        </div>
    )
}

export default function HomepageFeatures(): ReactNode {
    return (
        <section className={styles.features}>
            <div className="container">
                <div className="row">
                    {FeatureList.map((props, idx) => (
                        <Feature key={idx} {...props} />
                    ))}
                </div>
            </div>
        </section>
    )
}
