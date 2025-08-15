'use client'

import styles from "./page.module.css";
import {FormEvent, useState} from "react";
import {useRouter} from "next/navigation";

export default function Home() {
    const router = useRouter()
    const [playerId, setPlayerId] = useState<string | null>(null)

    function onClickPlayer(e: FormEvent) {
        e.preventDefault()
        if (playerId !== null) {
            router.push("/player/" + playerId)
        }
    }

    return (
        <div className={styles.page}>
            <section className={styles.card}>
                <p>This is a viewer for <a href="https://mmoldb.beiju.me/">MMOLDB</a> data.</p>

                <p>Available pages:</p>

                <form onSubmit={onClickPlayer}>
                    <p>
                        <code>/player/</code><input placeholder={"Player ID"} onInput={e => setPlayerId(e.currentTarget.value)} />
                        <input type="submit" value="&rarr;" />
                    </p>
                </form>
            </section>
        </div>
    );
}
