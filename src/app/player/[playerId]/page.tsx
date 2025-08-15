'use client'

import useSWR from 'swr'
import { use } from "react"
import { API_BASE } from "@/util/api_base"
import { swrConfig } from "@/util/swr_config"

async function playerVersionsFetcher(playerId: string)  {
    const response = await fetch(`${API_BASE}/player_versions/${playerId}`, {})
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} when fetching player ${playerId}`)
    }
    return await response.json()
}

export default function BlogPostPage({
    params,
}: {
    params: Promise<{ playerId: string }>
}) {
    const { playerId } = use(params)
    const { data, error, isLoading } = useSWR(
        playerId,
        playerVersionsFetcher,
        swrConfig,
    )

    if (isLoading) {
        return (
            <section className="card">
                <p>Loading player {playerId}...</p>
            </section>
        )
    }

    if (error) {
        return (
            <section className="card set-error-background-color">
                <p>Error: {error.message}</p>
            </section>
        )
    }

    return (
        <pre>
            {JSON.stringify(data)}
        </pre>
    )
}