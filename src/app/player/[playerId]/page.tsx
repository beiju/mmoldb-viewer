'use client'

import styles from "./player.module.css"
import useSWR from 'swr'
import { use, useEffect, useMemo, useRef, useState } from "react"
import { API_BASE } from "@/util/api_base"
import { swrConfig } from "@/util/swr_config"
import _ from "lodash"
import { diffArrays } from "diff"

const REPORTS_STARTED_LIVE_UPDATING = "2025-08-02T23:54:00.000Z"

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
    "modifications",
    "equipment",
    "reports",
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

type ApiModification = {
    name: string,
    emoji: string,
    description: string,
}

type EffectType = (
    "Flat" |
    "Additive" |
    "Multiplicative"
)

type ApiEquipmentEffect = {
    attribute: string,
    effect_type: EffectType,
    value: number,
}

type ApiEquipment = {
    emoji: string,
    name: string,
    special_type: string | null,
    description: string | null,
    rare_name: string | null,
    cost: number | null,
    prefixes: (string | null)[],
    suffixes: (string | null)[],
    rarity: string | null,
    effects: (ApiEquipmentEffect | null)[],
}

type ApiReportAttribute = {
    stars: number,
}

type ApiReport = {
    season: number | null, // null means not included
    day_type: DayType | null, // null could mean unrecognized or not included
    day: number | null,
    superstar_day: number | null,
    quote: string,
    attributes: { [attribute: string]: ApiReportAttribute | null },
}

type ApiRecompositionEvent = {
    event_type: "Recomposition",
    time: string,
    new_name: string,
    reverts_recomposition: string | null,
}

type ApiAttributeAugmentEvent = {
    event_type: "AttributeAugment",
    time: string,
    attribute: string,
    value: number,
}

type ApiPartyEvent = {
    event_type: "Party",
    attribute: string,
    value: number,
}

type ApiEvent = ApiRecompositionEvent | ApiAttributeAugmentEvent | ApiPartyEvent

type ApiPlayerVersion = {
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
    greater_boon: ApiModification | null,
    lesser_boon: ApiModification | null,
    modifications: (ApiModification | null)[],
    equipment: { [slot: string]: ApiEquipment | null },
    reports: { [category: string]: ApiReport | null },
    events: ApiEvent[]
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

type AnnotatedVersionPrev<V> = {
    data: V,
    differences: string[],
}

type AnnotatedVersion<V> = {
    data: V,
    prev: AnnotatedVersionPrev<V> | null,
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

function getVersionFromCoordinates(x: number, y: number): number | undefined {
    const elementHierarchy = document.elementsFromPoint(x, y)
    for (const element of elementHierarchy) {
        if (element.classList.contains(styles.versionsListItem)) {
            const attr = element.getAttribute("data-version-index")
            if (attr !== null) {
                const attrNum = parseInt(attr, 10)
                if (isFinite(attrNum)) {
                    return attrNum
                }
            }
        }
    }
}

function getMousedOverVersion(evt: { clientX: number; clientY: number }): number | undefined {
    const version = getVersionFromCoordinates(evt.clientX, evt.clientY)
    if (typeof version !== "undefined" && isFinite(version)) {
        return version
    }
    // Terrible hack
    return getVersionFromCoordinates(evt.clientX - 30, evt.clientY)
}

function differencesLabel(version: AnnotatedVersion<ApiPlayerVersion>): string[] {
    if (version.prev === null) {
        return [`Born ${version.data.first_name} ${version.data.last_name}`]
    } else if (version.prev.differences.length === 0) {
        return ["Nothing (oops)"]
    }

    let differences = [...version.prev.differences]

    function take(takeDifferences: string[], optionalDifferences: string[] | undefined = undefined): boolean {
        if (!differences) throw Error("This should never happen")
        for (const difference of takeDifferences) {
            if (!differences.includes(difference)) {
                return false
            }
        }

        // If we got this far, then we should remove them
        for (const difference of takeDifferences) {
            const idx = differences.indexOf(difference)
            differences.splice(idx, 1)
        }

        if (optionalDifferences) {
            for (const difference of optionalDifferences) {
                const idx = differences.indexOf(difference)
                if (idx >= 0) differences.splice(idx, 1)
            }
        }

        return true
    }

    const take_recompose = () => take(
        ["first_name", "last_name"],
        ["batting_handedness", "pitching_handedness", "likes", "dislikes", "home",
            "birthseason", "birthday_type", "birthday_day", "birthday_superstar_day", "reports"]
    )

    const changes = []

    // Label when reports started updating live because otherwise it's confusing
    if (version.data.valid_from >= REPORTS_STARTED_LIVE_UPDATING && version.prev && version.prev.data.valid_from < REPORTS_STARTED_LIVE_UPDATING) {
        take(["reports"])
        changes.push("Reports begin to update live")
    }

    for (const event of version.data.events) {
        if (event.event_type === "Recomposition") {
            // TODO Some sort of error if this `take` returns false
            take_recompose()
            if (event.reverts_recomposition === null) {
                changes.push(`Recomposed into ${event.new_name}`)
            } else if (event.new_name === `${version.prev.data.first_name} ${version.prev.data.last_name}`) {
                changes.push(`Recomposed attributes reverted`)
            } else {
                changes.push(`Unrecomposed back to ${event.new_name}`)
            }
        } else if (event.event_type === "AttributeAugment") {
            // TODO Some sort of error if this `take` returns false
            take(["reports"])
            changes.push(`Augment: +${event.value} ${event.attribute}`)
        } else if (event.event_type === "Party") {
            // TODO Some sort of error if this `take` returns false
            take(["reports"])
            changes.push(`Party: +${event.value} ${event.attribute}`)
        }
    }

    while (differences.length > 0) {
        if (take(["slot"])) {
            changes.push(`Swapped from ${slotAbbreviation(version.prev.data.slot)} to ${slotAbbreviation(version.data.slot)}`)
        } else if (take_recompose()) {
            changes.push(`Recomposed into ${version.data.first_name} ${version.data.last_name} (inferred)`)
        } else if (take(["greater_boon"])) {
            if (version.prev.data.greater_boon === null) {
                changes.push("Gained greater boon")
            } else if (version.data.greater_boon === null) {
                changes.push("Lost greater boon")
            } else {
                changes.push("Replaced greater boon")
            }
        } else if (take(["lesser_boon"])) {
            if (version.prev.data.lesser_boon === null) {
                changes.push("Gained lesser boon")
            } else if (version.data.lesser_boon === null) {
                changes.push("Lost lesser boon")
            } else {
                changes.push("Replaced lesser boon")
            }
        } else if (take(["modifications"])) {
            changes.push("Modifications changed")
        } else if (take(["equipment"])) {
            changes.push("Equipment changed")
        } else if (take(["reports"])) {
            for (const [category, report] of Object.entries(version.data.reports)) {
                if (!version.prev.data.reports.hasOwnProperty(category)) {
                    changes.push(`${category} report generated`)
                } else if (!_.isEqual(report, version.prev.data.reports[category])) {
                    changes.push(`${category} report changed`)
                }
            }
            for (const prevCategory of Object.keys(version.prev.data.reports)) {
                if (!version.data.reports.hasOwnProperty(prevCategory)) {
                    changes.push(`${prevCategory} report deleted`)
                }
            }
        } else if (take(["mmolb_team_id"])) {
            changes.push("Team changed")
        } else {
            changes.push(...differences)
            differences = []
        }
    }
    return changes
}

function VersionsList({ versions, selectedVersion, setSelectedVersion }: {
    versions: AnnotatedVersion<ApiPlayerVersion>[] | null,
    selectedVersion: number,
    setSelectedVersion: (idx: number) => void,
}) {
    const listRef = useRef<HTMLUListElement>(null);
    const [isMovingSlider, setIsMovingSlider] = useState<boolean>(false)
    const [blockClick, setBlockClick] = useState<boolean>(false)

    // automatically clear blockClick after a short time
    useEffect(() => {
        if (blockClick) {
            setTimeout(() => setBlockClick(false), 100)
        }
    }, [blockClick])

    // Select the correct slider every time it becomes active
    useEffect(() => {
        if (!listRef.current) return
        for (const li of listRef.current.children) {
            const versionIndex = li.getAttribute("data-version-index");
            if (versionIndex !== null) {
                if (parseInt(versionIndex, 10) === selectedVersion) {
                    for (const child of li.children) {
                        if (child.classList.contains(styles.versionsListSlider)) {
                            (child as HTMLElement)?.focus()
                        }
                    }
                }
            }
        }
    }, [listRef, selectedVersion])

    if (!versions) return null

    return (<div
        className={styles.versionsListContainer}
    >
        <ul className={styles.versionsList} ref={listRef}>
            {
                versions.map((version, idx) => {
                    const label = differencesLabel(version)
                    return (<li
                        className={styles.versionsListItem}
                        key={version.data["valid_from"]}
                        data-version-index={idx}
                        onClick={() => { {
                            if (!isMovingSlider && !blockClick) {
                                setSelectedVersion(idx)
                            }
                        }}}
                    >
                        {label.map((l, i) => <p key={i}>{l}</p>)}
                        <div
                            className={`${styles.versionsListSlider} ${isMovingSlider ? "" : styles.versionsListSliderActive}`}
                            hidden={selectedVersion !== idx}
                            onPointerDown={event => {
                                // Capture the pointer so we receive the subsequent onPointerUp, regardless
                                // where it happens
                                event.currentTarget.setPointerCapture(event.pointerId)
                                setIsMovingSlider(true)
                            }}
                            onPointerUp={evt => {
                                if (isMovingSlider) {
                                    evt.stopPropagation()
                                    evt.preventDefault()
                                    // Unfortunately I can't figure out any other way to not have
                                    // the click event fire after a drag ends
                                    setBlockClick(true)
                                    setIsMovingSlider(false)
                                }
                            }}
                            onPointerCancel={() => setIsMovingSlider(false)}
                            onPointerMove={evt => {
                                if (isMovingSlider) {
                                    evt.preventDefault()
                                    const newSelection = getMousedOverVersion(evt)
                                    if (typeof newSelection !== "undefined") {
                                        if (isFinite(newSelection)) {
                                            setSelectedVersion(newSelection)
                                        }
                                    }
                                }
                            }}
                            tabIndex={1} /* necessary for onKeyDown to fire */
                            onKeyDown={evt => {
                                if (evt.key === "ArrowDown" && selectedVersion + 1 < versions.length) {
                                    setSelectedVersion(selectedVersion + 1)
                                    evt.preventDefault()
                                } else if (evt.key === "ArrowUp" && selectedVersion > 0) {
                                    setSelectedVersion(selectedVersion - 1)
                                    evt.preventDefault()
                                }
                            }}
                        />
                    </li>
                )}
            )}
        </ul>
    </div>)
}

function slotAbbreviation(slot: Slot | null): string {
    switch (slot) {
        case null: return ""
        case "Catcher": return "C"
        case "FirstBase": return "1B"
        case "SecondBase": return "2B"
        case "ThirdBase": return "3B"
        case "Shortstop": return "SS"
        case "LeftField": return "LF"
        case "CenterField": return "CF"
        case "RightField": return "RF"
        case "DesignatedHitter": return "DH"
        case "StartingPitcher1": return "SP1"
        case "StartingPitcher2": return "SP2"
        case "StartingPitcher3": return "SP3"
        case "StartingPitcher4": return "SP4"
        case "StartingPitcher5": return "SP5"
        case "ReliefPitcher1": return "RP1"
        case "ReliefPitcher2": return "RP2"
        case "ReliefPitcher3": return "RP3"
        case "Closer": return "CL"
        case "StartingPitcher": return "SP"
        case "ReliefPitcher": return "RP"
        case "Pitcher": return "P"
    }
}

function changeClass<T>(current: T | null, prev: T | null): string {
    if (current === null && prev !== null) {
        return styles.removed
    } else if (current !== null && prev === null) {
        return styles.added
    } else if (!_.isEqual(current, prev)) {
        return styles.changed
    } else {
        return ""
    }
}

function ModificationDisplay({ modification, prev_modification, modificationType }: {
    modification: ApiModification | null,
    prev_modification: ApiModification | null | undefined,
    modificationType: string | null,
}) {
    // Display the current version if it's non-null, or the prev version if it is null
    const mod = modification || prev_modification
    if (!mod) {
        return <div className={`${styles.emptyUnit} ${styles.versionUnitOfChange}`}>No {modificationType}</div>
    } else {
        return (
            <div className={`${styles.boon} ${styles.versionUnitOfChange} ${changeClass(modification, prev_modification)}`}>
                <h3>{mod.emoji} {mod.name}</h3>
                <p className={styles.btw}>{mod.description}</p>
            </div>
        )
    }
}

function equipmentNameDisplay(equipment: ApiEquipment): string {
    const rarityDisplay = equipment.rarity ? ` (${equipment.rarity})` : ""
    if (equipment.rare_name) {
        return `${equipment.emoji} ${equipment.rare_name}${rarityDisplay}`
    } else {
        return `${equipment.emoji} ${equipment.prefixes.join(" ")} ${equipment.name} ${equipment.suffixes.join(" ")}${rarityDisplay}`
    }
}

function effectValueDisplay(effectType: EffectType, effectValue: number): string {
    // TODO Handle unknown effect type
    switch (effectType) {
        case "Flat": return `+${(effectValue * 100).toFixed(0)}`
        case "Additive": return `+${(effectValue * 100).toFixed(0)}%`
        case "Multiplicative": return `&times;${(effectValue * 100).toFixed(0)}%`
    }
}

function EquipmentDisplay({ slot, equipment, prevEquipment }: {
    slot: string,
    equipment: ApiEquipment | null,
    prevEquipment: ApiEquipment | null,
}) {
    const equip = equipment || prevEquipment
    return (
        <div>
            <h2 className={styles.unitLabel}>{slot}</h2>
            <div className={`${styles.versionUnitOfChange} ${changeClass(equipment, prevEquipment)} ${equip ? "" : styles.emptyUnit}`}>
                <p>{equip ? equipmentNameDisplay(equip) : "Empty"}</p>
                {equip && equip.effects.length > 0 && (
                    <ul>
                        {equip.effects.map((effect, i) => (
                            effect ? (
                                <li key={i}>{effect.attribute}: {effectValueDisplay(effect.effect_type, effect.value)} {}</li>
                            ) : (
                                <li key={i} className="error">Unrecognized equipment effect</li>
                            )
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

function ReportDisplay({ category, report, prevReport }: {
    category: string,
    report: ApiReport | null,
    prevReport: ApiReport | null,
}) {
    if (!report) {
        return (
            <div className={`${styles.versionUnitOfChange} ${styles.emptyUnit}`}>
                {category} report empty
            </div>
        )
    }

    // This will display nothing if `season` is null but `day_type` isn't.
    // Not sure what should be done in that case.
    let seasonDisplay = null;
    if (report.season !== null) {
        const [seasonDayStr, seasonDayIsError] = displaySeasonDay(report.season, report.day_type, report.day, report.superstar_day)
        seasonDisplay = (<p className={seasonDayIsError ? "error" : ""}>Report generated during {seasonDayStr}</p>)
    }

    const reportChangeClass = changeClass(
        report ? _.omit(report, ["attributes"]) : null,
        prevReport ? _.omit(prevReport, ["attributes"]) : null,
    )

    const matchedReports = _.uniq(_.flatten([
        report ? Object.keys(report.attributes) : [],
        prevReport ? Object.keys(prevReport.attributes) : [],
    ])).sort()

    return (
        <div className={`${styles.versionUnitOfChange} ${reportChangeClass}`}>
            {seasonDisplay}
            <p>&ldquo;{report.quote}&rdquo;</p>
            {Object.entries(report.attributes).length > 0 && (
                <table className={styles.attributesTable}>
                    <tbody>
                        {matchedReports
                            .map((attr, idx) => (
                                <ReportAttributeDisplay
                                    key={idx}
                                    attr={attr}
                                    attribute={report ? report.attributes[attr] ?? null: null}
                                    prevAttribute={prevReport ? prevReport.attributes[attr] ?? null : null} />
                            ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

function starsGroupClassName(i: number) {
    if (i < 4) {
        return styles.starsGroup1
    } else if (i < 8) {
        return styles.starsGroup2
    } else if (i < 12) {
        return styles.starsGroup3
    } else if (i < 16) {
        return styles.starsGroup4
    } else if (i < 20) {
        return styles.starsGroup5
    }
    return ""
}

function ReportAttributeDisplay({ attr, attribute, prevAttribute }: {
    attr: string,
    attribute: ApiReportAttribute | null,
    prevAttribute: ApiReportAttribute | null,
}) {
    let numUnstyledStars
    if (attribute !== null && prevAttribute !== null) {
        numUnstyledStars = Math.min(attribute.stars, prevAttribute.stars)
    } else if (attribute !== null) {
        numUnstyledStars = attribute.stars
    } else if (prevAttribute !== null) {
        numUnstyledStars = prevAttribute.stars
    } else {
        return (
            <tr>
                <td className={styles.attributeLabel}>{attr}</td>
                <td className={styles.starsUnknown}>Unknown</td>
            </tr>
        )
    }

    const starsDisplay = []
    for (let i = 0; i < numUnstyledStars; i++) {
        starsDisplay.push(
            <span key={i} className={`${starsGroupClassName(i)}`}>★</span>
        )
    }
    if (attribute && attribute.stars > numUnstyledStars) {
        const starsInside = []
        for (let i = numUnstyledStars; i < attribute.stars; i++) {
            starsInside.push(
                <span key={i} className={`${starsGroupClassName(i)}`}>★</span>
            )
        }
        starsDisplay.push(<span key={numUnstyledStars} className={styles.starsAdded}>{starsInside}</span>)
    }
    if (prevAttribute && prevAttribute.stars > numUnstyledStars) {
        const starsInside = []
        for (let i = numUnstyledStars; i < prevAttribute.stars; i++) {
            starsInside.push(<span key={i} className={`${starsGroupClassName(i)}`}>☆</span>
            )
        }
        starsDisplay.push(<span key={numUnstyledStars} className={styles.starsRemoved}>{starsInside}</span>)
    }

    return (
        <tr>
            <td className={styles.attributeLabel}>{attr}</td>
            <td className={styles.stars}>{starsDisplay}</td>
        </tr>
    )
}

function zipMatching<T>(a: T[], b: T[]): [T | null, T | null][] {
    const output: [T | null, T | null][] = []
    const changes = diffArrays(a, b, { comparator: _.isEqual })

    for (const change of changes) {
        if (change.added) {
            // Then b has it but a doesn't
            for (const value of change.value) {
                output.push([null, value])
            }
        } else if (change.removed) {
            // Then a has it but b doesn't
            for (const value of change.value) {
                output.push([value, null])
            }
        } else {
            // Then both have it
            for (const value of change.value) {
                output.push([value, value])
            }
        }
    }

    return output
}

function PlayerDisplay({ player }: { player: AnnotatedVersion<ApiPlayerVersion> | undefined }) {
    const dateFormat = useMemo(() => new Intl.DateTimeFormat(undefined, {
        dateStyle: "full",
        timeStyle: "long",
    }), [])

    if (!player) return null
    const { data } = player
    const [seasonDayStr, seasonDayIsError] = displaySeasonDay(data.birthseason, data.birthday_type, data.birthday_day, data.birthday_superstar_day)

    // TODO This is pretty redundant with the changes detection in VersionsList
    const changes = {
        slot: player.prev && player.data.slot !== player.prev.data.slot,
        identity: player.prev && (
            player.data.first_name !== player.prev.data.first_name ||
                player.data.last_name !== player.prev.data.last_name ||
                player.data.number !== player.prev.data.number ||
                player.data.home !== player.prev.data.home ||
                player.data.likes !== player.prev.data.likes ||
                player.data.dislikes !== player.prev.data.dislikes ||
                player.data.batting_handedness !== player.prev.data.batting_handedness ||
                player.data.pitching_handedness !== player.prev.data.pitching_handedness
        )
    }

    const matchedModifications = zipMatching(player.data.modifications, player.prev?.data.modifications ?? [])
    const matchedEquipment = _.uniq([...Object.keys(data.equipment), ...Object.keys(player.prev?.data.equipment ?? [])]).sort()
    const matchedReports = _.uniq([...Object.keys(data.reports), ...Object.keys(player.prev?.data.reports ?? [])]).sort()

    const validFrom = new Date(data.valid_from);
    const validUntil = data.valid_until === null ? null : new Date(data.valid_until);
    return (
        <div className={styles.versionDetail}>
            <div className={styles.datesContainer}>
                <div className={styles.validFrom}>from {dateFormat.format(validFrom)} <span className={styles.apiDate}>{data.valid_from}</span></div>
                {validUntil ?
                    <div className={styles.validUntil}>to {dateFormat.format(validUntil)} <span className={styles.apiDate}>{data.valid_until}</span></div> :
                    <div className={styles.validUntil}>to current</div>
                }
            </div>
            <div className={`${styles.versionUnitOfChange} ${changes.identity ? styles.changed : ""}`}>
                <h1 className={styles.containsInsetUnitOfChange}>
                    <span className={`${styles.insetUnitOfChange} ${changes.slot ? styles.changed : ""} ${changes.identity && !changes.slot ? styles.unchangedInsetInsideChangedContainer : ""}`}>
                        {slotAbbreviation(data.slot)}
                    </span>
                    {data.first_name} {data.last_name} #{data.number}
                </h1>
                <p className={seasonDayIsError ? "error" : ""}>Born during {seasonDayStr}</p>
                <p>From {data.home}</p>
                <p>Likes {data.likes}</p>
                <p>Dislikes {data.dislikes}</p>
                <p>Bats {data.batting_handedness}</p>
                <p>Pitches {data.pitching_handedness}</p>
            </div>
            <div>
                <h2 className={styles.unitLabel}>Greater boon</h2>
                <ModificationDisplay
                    modificationType="greater boon"
                    modification={data.greater_boon}
                    prev_modification={player.prev?.data.greater_boon} />
            </div>
            <div>
                <h2 className={styles.unitLabel}>Lesser boon</h2>
                <ModificationDisplay
                    modificationType="lesser boon"
                    modification={data.lesser_boon}
                    prev_modification={player.prev?.data.lesser_boon} />
            </div>
            <div>
                <h2 className={styles.unitLabel}>Modifications</h2>
                {matchedModifications.length ? matchedModifications.map(([a, b], i) => (
                    <ModificationDisplay
                        key={i}
                        modificationType="modifications"
                        modification={a ?? null}
                        prev_modification={b ?? null} />
                )) : (
                    <ModificationDisplay
                        modificationType="modifications"
                        modification={null}
                        prev_modification={null} />

                )}
            </div>
            <div className={styles.sideways}>
                {matchedEquipment.map((slot, idx) => (
                    <EquipmentDisplay
                        key={idx}
                        slot={slot}
                        equipment={data.equipment[slot] ?? null}
                        prevEquipment={player.prev ? player.prev.data.equipment[slot] ?? null : null} />
                ))}
            </div>
            {matchedReports.map((category, idx) => (
                <div key={idx}>
                    <h2 className={styles.unitLabel}>{category}</h2>
                    <ReportDisplay
                        category={category}
                        report={data.reports[category] ?? null}
                        prevReport={player.prev ? player.prev.data.reports[category] ?? null : null} />
                </div>
            ))}
            {/*<pre>{ JSON.stringify(player, null, 2) }</pre>*/}
        </div>
    )
}

function getDifferingKeysOfInterest(a: Record<string, unknown>, b: Record<string, unknown>) {
    return KEYS_OF_INTEREST
        .filter((key) => !_.isEqual(a[key], b[key]))
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
                    prev: null,
                })
            } else {
                const prevVersion: ApiPlayerVersion = versions[versions.length - 1].data
                const differences = getDifferingKeysOfInterest(version, prevVersion)
                if (differences.length > 0) {
                    versions.push({
                        data: version,
                        prev: {
                            data: prevVersion,
                            differences,
                        }
                    })
                }
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
                <div className={`card ${styles.versionsCard}`}>
                    <div className={styles.versionsContainer}>
                        <VersionsList versions={playerVersions} selectedVersion={selectedVersion}
                                      setSelectedVersion={setSelectedVersion} />
                        <PlayerDisplay player={playerVersions[selectedVersion]} />
                    </div>
                    <p className="disclaimer">
                        Note: feed-event-to-player-version matching is imperfect. Some changes may be displayed
                        under the wrong version header.
                    </p>
                </div>
            ) : (
                <section className={styles.versionsContainer}>
                    <p>No versions for this player</p>
                </section>
            )
        }
        {/*<pre>*/}
        {/*    {JSON.stringify(data, null, 4)}*/}
        {/*</pre>*/}
    </>)
}