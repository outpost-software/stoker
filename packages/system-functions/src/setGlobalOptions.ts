import {
    GlobalOptions,
    MemoryOption,
    setGlobalOptions,
} from "firebase-functions/v2";
import {
    defineString,
    defineInt,
    defineBoolean,
} from "firebase-functions/params";

export const setGlobalVariables = () => {
    const globalRegion = defineString("FB_FUNCTIONS_REGION", {
        description: "The default region for Cloud Functions.",
    });
    const globalMemory = defineString("FB_FUNCTIONS_MEMORY", {
        description: "The default memory for Cloud Functions.",
    });
    const globalTimeout = defineInt("FB_FUNCTIONS_TIMEOUT", {
        description: "The default timeout for Cloud Functions.",
    });
    const globalMinInstances = defineInt("FB_FUNCTIONS_MIN_INSTANCES", {
        description: "The default minimum instances for Cloud Functions.",
    });
    const globalMaxInstances = defineInt("FB_FUNCTIONS_MAX_INSTANCES", {
        description: "The default maximum instances for Cloud Functions.",
    });
    const globalCPU = defineInt("FB_FUNCTIONS_CPU", {
        description: "The default CPU for Cloud Functions.",
    });
    const globalConcurrency = defineInt("FB_FUNCTIONS_CONCURRENCY", {
        description: "The default concurrency for Cloud Functions.",
    });
    const enforceAppCheck = defineBoolean("STOKER_FB_ENABLE_APP_CHECK", {
        description: "Whether to enforce App Check for Cloud Functions.",
    });

    const globalOptions: GlobalOptions = {
        region: globalRegion.value(),
        memory: globalMemory.value() as MemoryOption,
        timeoutSeconds: globalTimeout.value(),
        minInstances: globalMinInstances.value(),
        maxInstances: globalMaxInstances.value(),
        cpu: globalCPU.value(),
        concurrency: globalConcurrency.value(),
        enforceAppCheck: enforceAppCheck.value(),
    };
    setGlobalOptions(globalOptions);
};
