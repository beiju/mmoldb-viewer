import { SWRConfiguration } from "swr";

const retryIntervals = [100, 1000, 5000]

export const swrConfig: SWRConfiguration = {
    onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
        // Never retry on 404.
        if (error.status === 404) return

        // Don't retry more than retryIntervals
        if (retryCount >= retryIntervals.length) return

        // Retry according to retryIntervals
        setTimeout(() => revalidate({ retryCount }), retryIntervals[retryCount])
    }
}