'use client'

import styles from "./player.module.css";
import useSWR from 'swr'
import { use, useMemo, useState } from "react"
import { API_BASE } from "@/util/api_base"
import { swrConfig } from "@/util/swr_config"
import { Slider } from 'react-compound-slider'

// TODO Offer configuration for which keys are of interest
const KEYS_OF_INTEREST = [
    "first_name",
    "last_name",
    "batting_handedness",
    "pitching_handedness",
    "home",
    "birthseason",
    "birthday_type",
    "birthday_day",
    "birthday_superstar_day",
    "likes",
    "dislikes",
    "number",
    "mmolb_team_id",
    "slot",
    "greater_boon",
    "lesser_boon",
]

type Handedness = "Right" | "Left" | "Switch"
type DayType = (
    "Preseason" |
    "RegularDay" |
    "SuperstarBreak" |
    "SuperstarGame" |
    "SuperstarDay" |
    "PostseasonPreview" |
    "PostseasonRound1" |
    "PostseasonRound2" |
    "PostseasonRound3" |
    "Election" |
    "Holiday" |
    "Event" |
    "SpecialEvent"
)
type Slot = (
    "Catcher" |
    "FirstBase" |
    "SecondBase" |
    "ThirdBase" |
    "Shortstop" |
    "LeftField" |
    "CenterField" |
    "RightField" |
    "DesignatedHitter" |
    "StartingPitcher1" |
    "StartingPitcher2" |
    "StartingPitcher3" |
    "StartingPitcher4" |
    "StartingPitcher5" |
    "ReliefPitcher1" |
    "ReliefPitcher2" |
    "ReliefPitcher3" |
    "Closer" |
    "StartingPitcher" |
    "ReliefPitcher" |
    "Pitcher"
)

type ApiPlayerVersion =  {
    id: string,
    valid_from: string, // TODO a proper date type?
    valid_until: string | null, // TODO a proper date type?
    first_name: string,
    last_name: string,
    batting_handedness: Handedness | null, // null means unrecognized
    pitching_handedness: Handedness | null, // null means unrecognized
    home: string,
    birthseason: number,
    birthday_type: DayType | null, // null means unrecognized
    birthday_day: number | null,
    birthday_superstar_day: number | null,
    likes: string,
    dislikes: string,
    number: number,
    mmolb_team_id: string | null,
    slot: Slot | null,
    durability: number,
    // TODO
    // pub greater_boon: Option<i64>,
    // pub lesser_boon: Option<i64>,
};

type ApiPlayerVersions = {
    player_id: string,
    versions: ApiPlayerVersion[],
};

async function playerVersionsFetcher(playerId: string): Promise<ApiPlayerVersions> {
    const response = await fetch(`${API_BASE}/player_versions/${playerId}`, {})
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} when fetching player ${playerId}`)
    }
    return await response.json()
}

type AnnotatedVersion<V> = {
    data: V,
    differences: string[] | null,
}

interface HasValidity {
    valid_from: string;
}

function displayDay(day_type: DayType | null, day: number | null, superstar_day: number | null): [string, boolean] {
    if (day_type === null) {
        return ["Unknown day", true]
    } else if (day_type === "RegularDay") {
        if (day === null) {
            return ["Unknown regular day", true]
        } else {
            return [`Day ${day}`, false]
        }
    } else if (day_type === "SuperstarDay") {
        if (superstar_day === null) {
            return ["Unknown superstar day", true]
        } else {
            return [`Superstar Day ${superstar_day}`, false]
        }
    } else {
        return [day_type, false]
    }
}

function displaySeasonDay(season: number, day_type: DayType | null, day: number | null, superstar_day: number | null): [string, boolean] {
    const [dayStr, error] = displayDay(day_type, day, superstar_day)
    return [`Season ${season} ${dayStr}`, error]
}

function getMousedOverVersion(evt: MouseEvent) {
    const elementHierarchy = document.elementsFromPoint(evt.clientX, evt.clientY)
    for (const element of elementHierarchy) {
        if (element.classList.contains(styles.versionsListItem)) {
            const attr = element.getAttribute("data-version-index")
            console.log(attr)
            const attrNum = parseInt(attr, 10)
            if (isFinite(attrNum)) {
                return attrNum
            }
        }
    }
}

function VersionsList({ versions, selectedVersion, setSelectedVersion }: {
    versions: AnnotatedVersion<HasValidity>[] | null,
    selectedVersion: number,
    setSelectedVersion: (number) => void,
}) {
    const [isMovingSlider, setIsMovingSlider] = useState<boolean>(false)

    if (!versions) return null

    return (<div className={styles.versionsListContainer}>
        <ul className={styles.versionsList}>
            {versions.map((version, idx) => (
                <li
                    className={styles.versionsListItem}
                    key={version.data["valid_from"]}
                    data-version-index={idx}
                    onMouseMove={evt => {
                        if (isMovingSlider) {
                            const newSelection = getMousedOverVersion(evt)
                            if (isFinite(newSelection)) {
                                setSelectedVersion(newSelection)
                            }
                        }
                    }}
                >
                    {version.differences === null ?
                        "Born" :
                        version.differences.length ?
                            version.differences.join(", ") :
                            "nothing"
                    }
                    {selectedVersion == idx ?
                        <div
                            className={`${styles.versionsListSlider} ${isMovingSlider ? "" : styles.versionsListSliderActive}`}
                            onPointerDown={event => {
                                // Capture the pointer so we receive the subsequent onPointerUp, regardless
                                // where it happens
                                event.currentTarget.setPointerCapture(event.pointerId)
                                setIsMovingSlider(true)
                            }}
                            onPointerUp={() => setIsMovingSlider(false)}
                            onPointerMove={evt => {
                                if (isMovingSlider) {
                                    console.log("Pointer moved in", evt.target)
                                }
                            }}
                        />
                        :
                        null
                    }
                </li>
            ))}
        </ul>
        <div className={styles.versionsListSlider}></div>
    </div>)
}

function PlayerDisplay({ player }: { player: AnnotatedVersion<ApiPlayerVersion> | undefined }) {
    if (!player) return null

    const { data } = player
    const [seasonDayStr, seasonDayIsError] = displaySeasonDay(data.birthseason, data.birthday_type, data.birthday_day, data.birthday_superstar_day)
    return (
        <div className={styles.versionDetail}>
            <h1>{data.first_name} {data.last_name} #{data.number}</h1>
            <p className={seasonDayIsError ? "error" : ""}>Born {seasonDayStr}</p>
            <p>From {data.home}</p>
            <p>Bats {data.batting_handedness}</p>
            <p>Pitches {data.pitching_handedness}</p>
            <p>Likes {data.likes}</p>
            <p>Dislikes {data.dislikes}</p>

        </div>
    )
}

function getDifferingKeysOfInterest(a: object, b: object) {
    return KEYS_OF_INTEREST
        .filter((key) => a[key] !== b[key])
}

export default function PlayerVersionsPage({
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

    const [selectedVersion, setSelectedVersion] = useState<number>(0)

    const playerVersions: AnnotatedVersion<ApiPlayerVersion>[] | undefined = useMemo(() => {
        if (!data) return undefined
        const versions = []
        for (const version of data["versions"]) {
            if (versions.length < 1) {
                versions.push({
                    data: version,
                    differences: null,
                })
            } else {
                const prevVersion = versions[versions.length - 1].data
                const differences = getDifferingKeysOfInterest(version, prevVersion)
                versions.push({
                    data: version,
                    differences,
                })
            }
        }
        return versions
    }, [data])

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

    return (<>
        {
            playerVersions ? (
                <section className={styles.versionsContainer}>
                    <VersionsList versions={playerVersions} selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion} />
                    <PlayerDisplay player={playerVersions[selectedVersion]} />
                </section>
            ) : (
                <section className={styles.versionsContainer}>
                    <p>No versions for this player</p>
                </section>
            )
        }
        <pre>
            {JSON.stringify(data, null, 4)}
        </pre>
    </>)
}