import Layout from "@theme/Layout"

import React from "react"

const Contact = () => {
    return (
        <Layout title="Pricing" description="Stoker Pricing">
            <section className="relative z-10 overflow-hidden bg-white py-20 dark:bg-dark lg:py-[120px]">
                <div className="container">
                    <div className="-mx-4 flex flex-wrap lg:justify-between">
                        <div className="w-full px-4 lg:w-1/2 xl:w-6/12">
                            <div className="mb-12 max-w-[570px] lg:mb-0">
                                <span className="mb-4 block text-base font-semibold text-primary">Contact Us</span>
                                <h2 className="mb-6 text-[32px] font-bold text-dark dark:text-white sm:text-[40px] lg:text-[36px] xl:text-[40px]">
                                    Get In Touch With Us
                                </h2>
                                <p className="mb-9 text-base leading-relaxed text-body-color dark:text-dark-6">
                                    Feel free to contact us with any questions or feedback.
                                    <br></br>
                                    Alternatively, you can submit an issue on{" "}
                                    <a href="https://github.com/outpost-software/stoker" target="_blank">
                                        GitHub
                                    </a>
                                    .<br></br>
                                    <br></br>
                                    Stoker is in alpha mode.
                                    <br></br>
                                    We're currently offering free support (subject to availability). Get in touch and
                                    we'll add you to our private Slack support channel.
                                    <br></br>
                                    <br></br>
                                    Casey, Founder
                                    <br></br>
                                    GitHub: <a href="https://github.com/bigjimhere">@bigjimhere</a>
                                </p>

                                <div className="mb-8 flex w-full max-w-[370px]">
                                    <div className="mr-6 flex h-[60px] w-full max-w-[60px] items-center justify-center overflow-hidden rounded bg-primary/5 text-primary sm:h-[70px] sm:max-w-[70px]">
                                        <svg
                                            width="32"
                                            height="32"
                                            viewBox="0 0 32 32"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                d="M28 4.7998H3.99998C2.29998 4.7998 0.849976 6.1998 0.849976 7.9498V24.1498C0.849976 25.8498 2.24998 27.2998 3.99998 27.2998H28C29.7 27.2998 31.15 25.8998 31.15 24.1498V7.8998C31.15 6.1998 29.7 4.7998 28 4.7998ZM28 7.0498C28.05 7.0498 28.1 7.0498 28.15 7.0498L16 14.8498L3.84998 7.0498C3.89998 7.0498 3.94998 7.0498 3.99998 7.0498H28ZM28 24.9498H3.99998C3.49998 24.9498 3.09998 24.5498 3.09998 24.0498V9.2498L14.8 16.7498C15.15 16.9998 15.55 17.0998 15.95 17.0998C16.35 17.0998 16.75 16.9998 17.1 16.7498L28.8 9.2498V24.0998C28.9 24.5998 28.5 24.9498 28 24.9498Z"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </div>
                                    <div className="w-full">
                                        <h4 className="mb-1 text-xl font-bold text-dark dark:text-white">Email</h4>
                                        <p className="text-base text-body-color dark:text-dark-6">
                                            info@getoutpost.com
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </Layout>
    )
}

export default Contact
