import { themes as prismThemes } from "prism-react-renderer"
import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: "Stoker",
    tagline: "Build realtime, offline-ready enterprise applications.",
    favicon: "img/favicon.ico",

    // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
    future: {
        v4: true, // Improve compatibility with the upcoming Docusaurus v4
    },

    // Set the production url of your site here
    url: "https://stoker-website.web.app",
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: "/",

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: "", // Usually your GitHub org/user name.
    projectName: "", // Usually your repo name.

    onBrokenLinks: "throw",

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    presets: [
        [
            "classic",
            {
                docs: {
                    sidebarPath: "./sidebars.ts",
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    // editUrl:
                    //  'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                },
                blog: {
                    showReadingTime: true,
                    feedOptions: {
                        type: ["rss", "atom"],
                        xslt: true,
                    },
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    // editUrl:
                    //   'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                    // Useful options to enforce blogging best practices
                    onInlineTags: "warn",
                    onInlineAuthors: "warn",
                    onUntruncatedBlogPosts: "warn",
                },
                theme: {
                    customCss: "./src/css/custom.css",
                },
                gtag: {
                    trackingID: "AW-1061135520",
                    anonymizeIP: true,
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        // Replace with your project's social card
        image: "img/Stoker Logo.png",
        colorMode: {
            defaultMode: "dark",
            respectPrefersColorScheme: true,
        },
        navbar: {
            logo: {
                alt: "Stoker Title",
                src: "img/Stoker Title.png",
            },
            style: "dark",
            items: [
                {
                    type: "docSidebar",
                    sidebarId: "tutorialSidebar",
                    position: "left",
                    label: "Docs",
                },
                {
                    to: "/pricing",
                    label: "Pricing",
                    position: "left",
                },
                {
                    to: "/contact",
                    label: "Contact",
                    position: "left",
                },
                //  { to: "/blog", label: "Blog", position: "left" },
                {
                    to: "/docs/Getting Started",
                    label: "Alpha",
                    position: "right",
                    className: "alpha-button",
                },
                {
                    href: "https://github.com/outpost-software/stoker",
                    label: "GitHub",
                    position: "right",
                },
            ],
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "Docs",
                    items: [
                        {
                            label: "Getting Started",
                            to: "/docs/Getting Started",
                        },
                        {
                            label: "GitHub",
                            href: "https://github.com/outpost-software/stoker",
                        },
                    ],
                },
                /*  {
          title: 'Community',
          items: [
            {
              label: 'X',
              href: 'https://x.com/docusaurus',
            },
          ],
        }, */
                {
                    title: "More",
                    items: [
                        /*  {
                            label: "Blog",
                            to: "/blog",
                        }, */
                        {
                            label: "Pricing",
                            to: "/pricing",
                        },
                        {
                            label: "Privacy",
                            to: "/privacy",
                        },
                        {
                            label: "Contact",
                            to: "/contact",
                        },
                    ],
                },
            ],
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
    } satisfies Preset.ThemeConfig,

    plugins: [
        async function myPlugin(context, options) {
            return {
                name: "docusaurus-tailwindcss",
                configurePostCss(postcssOptions) {
                    postcssOptions.plugins.push(require("tailwindcss"))
                    postcssOptions.plugins.push(require("autoprefixer"))
                    return postcssOptions
                },
            }
        },
    ],
}

export default config
