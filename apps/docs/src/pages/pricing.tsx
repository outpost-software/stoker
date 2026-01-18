import React from "react"
import Layout from "@theme/Layout"

const PricingCard = ({ children, description, price, type, subscription, buttonText, active, buttonLink }) => {
    return (
        <>
            <div className="w-full px-4 md:w-1/2 lg:w-1/3">
                <div className="relative min-h-[400px] z-10 mb-10 overflow-hidden rounded-[10px] border-2 border-solid border-stroke bg-white px-8 py-10 shadow-pricing dark:border-dark-3 dark:bg-dark-2 sm:p-12 lg:px-6 lg:py-10 xl:p-[50px]">
                    <span className="mb-3 block text-lg font-semibold text-primary">{type}</span>
                    <h2 className="mb-5 text-[42px] font-bold text-dark dark:text-white">
                        {price}
                        <span className="text-base font-medium text-body-color dark:text-dark-6">{subscription}</span>
                    </h2>
                    <p className="mb-0 pb-8 text-base text-body-color dark:border-dark-3 dark:text-dark-6">
                        {description}
                    </p>
                    <a
                        href={buttonLink}
                        className={` ${
                            active
                                ? "block w-full rounded-md border border-solid border-primary bg-primary p-3 text-center text-base font-medium text-white transition hover:bg-opacity-90"
                                : "block w-full rounded-md border border-solid border-stroke bg-transparent p-3 text-center text-base font-medium text-primary transition hover:border-primary hover:bg-primary hover:text-white dark:border-dark-3"
                        } `}
                    >
                        {buttonText}
                    </a>
                    <div>
                        <span className="absolute right-0 top-7 z-[-1]">
                            <svg
                                width={77}
                                height={172}
                                viewBox="0 0 77 172"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <circle cx={86} cy={86} r={86} fill="url(#paint0_linear)" />
                                <defs>
                                    <linearGradient
                                        id="paint0_linear"
                                        x1={86}
                                        y1={0}
                                        x2={86}
                                        y2={172}
                                        gradientUnits="userSpaceOnUse"
                                    >
                                        <stop stopColor="#3056D3" stopOpacity="0.09" />
                                        <stop offset={1} stopColor="#C4C4C4" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </span>
                        <span className="absolute right-4 top-4 z-[-1]">
                            <svg
                                width={41}
                                height={89}
                                viewBox="0 0 41 89"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <circle
                                    cx="38.9138"
                                    cy="87.4849"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 87.4849)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="74.9871"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 74.9871)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="62.4892"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 62.4892)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="38.3457"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 38.3457)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="13.634"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 13.634)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="50.2754"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 50.2754)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="26.1319"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 26.1319)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="38.9138"
                                    cy="1.42021"
                                    r="1.42021"
                                    transform="rotate(180 38.9138 1.42021)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="87.4849"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 87.4849)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="74.9871"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 74.9871)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="62.4892"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 62.4892)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="38.3457"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 38.3457)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="13.634"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 13.634)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="50.2754"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 50.2754)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="26.1319"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 26.1319)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="26.4157"
                                    cy="1.4202"
                                    r="1.42021"
                                    transform="rotate(180 26.4157 1.4202)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="87.4849"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 87.4849)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="74.9871"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 74.9871)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="62.4892"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 62.4892)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="38.3457"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 38.3457)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="13.634"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 13.634)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="50.2754"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 50.2754)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="26.1319"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 26.1319)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="13.9177"
                                    cy="1.42019"
                                    r="1.42021"
                                    transform="rotate(180 13.9177 1.42019)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="87.4849"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 87.4849)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="74.9871"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 74.9871)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="62.4892"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 62.4892)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="38.3457"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 38.3457)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="13.634"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 13.634)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="50.2754"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 50.2754)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="26.1319"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 26.1319)"
                                    fill="#3056D3"
                                />
                                <circle
                                    cx="1.41963"
                                    cy="1.4202"
                                    r="1.42021"
                                    transform="rotate(180 1.41963 1.4202)"
                                    fill="#3056D3"
                                />
                            </svg>
                        </span>
                    </div>
                </div>
            </div>
        </>
    )
}

const List = ({ children }) => {
    return <p className="text-base text-body-color dark:text-dark-6">{children}</p>
}

const Pricing = () => {
    return (
        <Layout title="Pricing" description="Stoker Pricing">
            <section className="relative z-10 overflow-hidden bg-white pb-12 pt-16 dark:bg-dark lg:pb-[90px] lg:pt-[60px]">
                <div className="container mx-auto">
                    <div className="-mx-4 flex flex-wrap">
                        <div className="w-full px-4">
                            <div className="mx-auto mb-[60px] max-w-[510px] text-center">
                                <h2 className="mb-3 text-3xl text-primary font-bold leading-[1.208] text-dark dark:text-white sm:text-4xl md:text-[40px]">
                                    Stoker Pricing
                                </h2>
                                <p className="text-base text-body-color dark:text-dark-6">
                                    Contact us for free support during alpha mode (subject to availability).
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="-mx-4 flex flex-wrap justify-center">
                        <div className="-mx-4 flex flex-wrap">
                            <PricingCard
                                active={true}
                                type="Development"
                                price="Free"
                                subscription=""
                                description="Use Stoker for free while you develop your app.*"
                                buttonText="Go to the docs"
                                buttonLink="/docs/Getting Started"
                            >
                                <></>
                            </PricingCard>
                            <PricingCard
                                active={false}
                                type="First Production Tenant"
                                price="USD $29"
                                subscription="/ month"
                                description="This applies to an app's first active production tenant."
                                buttonText="Contact Us"
                                buttonLink="/contact"
                            >
                                <></>
                            </PricingCard>
                            <PricingCard
                                active={false}
                                type="Additional Production Tenants"
                                price="USD $9"
                                subscription="/ month"
                                description="Additional production tenants are free for the first 30 days. Contact us for bulk discounts."
                                buttonText="Contact Us"
                                buttonLink="/contact"
                            >
                                <></>
                            </PricingCard>
                        </div>
                    </div>
                </div>
                <p style={{ textAlign: "center", paddingLeft: "15%", paddingRight: "15%" }}>
                    * You'll need to purchase a commercial license to use Stoker in production. That said, feel free to
                    try it out during development to see if it's a good fit for your needs. Please see the included
                    license for full details.
                </p>
            </section>
        </Layout>
    )
}

export default Pricing
