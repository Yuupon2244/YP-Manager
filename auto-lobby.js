// ========================================
// YP-Manager 自動参加・観戦ローテーション
// v1.0.0
// ========================================
// このファイルは script.js / rooms.js の後に読み込む。
// 既存の参加者管理ロジックをなるべく再利用し、
// 「今の試合終了（参加中全員＋1）」の動作だけを拡張する。

"use strict";

let ypAutoLobbyBusy = false;
let ypRoundRotationBusy = false;
let ypAutoLobbySuppress = false;

const ypOriginalLoadParticipants = window.loadParticipants;


// ========================================
// 表示順の比較
// ========================================

function ypCompareParticipantOrder(a, b) {
    const orderA = Number(a?.display_order);
    const orderB = Number(b?.display_order);
    const validA = Number.isFinite(orderA);
    const validB = Number.isFinite(orderB);

    if (validA && validB && orderA !== orderB) {
        return orderA - orderB;
    }

    if (validA && !validB) {
        return -1;
    }

    if (!validA && validB) {
        return 1;
    }

    return String(a?.joined_at || "").localeCompare(
        String(b?.joined_at || "")
    );
}


// ========================================
// 現在の待機列を取得
// 管理画面の優先順：初見 → 交代待ち → 通常待機
// ========================================

function ypGetSortedWaitingQueue() {
    const waiting = participants
        .filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status === "waiting"
        )
        .sort(ypCompareParticipantOrder);

    const newcomers = waiting.filter(
        person => person.first_participation_pending === true
    );

    const exchange = waiting.filter(
        person => getLobbyState(person) === "exchange"
    );

    const normal = waiting.filter(
        person =>
            person.first_participation_pending !== true &&
            getLobbyState(person) !== "exchange"
    );

    return [...newcomers, ...exchange, ...normal];
}


// ========================================
// Supabaseでロビー状態を直接更新
// 定員判定は呼び出し側で行う。
// ========================================

async function ypSetLobbyStateDirect(person, lobbyState) {
    if (!person || !currentSessionId) {
        return false;
    }

    const patch = {
        status: "playing",
        lobby_state: lobbyState,
        first_participation_pending: false
    };

    const { data, error } = await supabaseClient
        .from("participants")
        .update(patch)
        .eq("id", person.id)
        .eq("session_id", currentSessionId)
        .select("id");

    if (error) {
        throw error;
    }

    if (!data || data.length === 0) {
        throw new Error(
            `${person.name || person.id} のロビー状態を更新できませんでした。`
        );
    }

    participants = participants.map(
        current =>
            current.id === person.id
                ? { ...current, ...patch }
                : current
    );

    return true;
}


// ========================================
// 待機列からロビーを自動補充
// 定員N人なら、満員時は参加中N-1人＋観戦1人
// ========================================

async function ypAutoFillLobby() {
    if (
        ypAutoLobbyBusy ||
        ypAutoLobbySuppress ||
        !currentSessionId
    ) {
        return;
    }

    const capacity = Number(getRoomCapacity());

    // 定員が不明・未設定なら勝手に人を移動しない。
    if (!Number.isFinite(capacity) || capacity < 2) {
        return;
    }

    ypAutoLobbyBusy = true;

    try {
        let guard = 0;

        while (
            getCurrentLobbyMembers().length < capacity &&
            guard < capacity + 5
        ) {
            guard += 1;

            const queue = ypGetSortedWaitingQueue();
            if (queue.length === 0) {
                break;
            }

            const nextPerson = queue[0];
            const active = getCurrentLobbyMembers();

            const playingCount = active.filter(
                person => getLobbyState(person) === "playing"
            ).length;

            const watchingCount = active.filter(
                person => getLobbyState(person) === "watching"
            ).length;

            const shouldWatch =
                watchingCount === 0 &&
                playingCount >= capacity - 1;

            await ypSetLobbyStateDirect(
                nextPerson,
                shouldWatch ? "watching" : "playing"
            );
        }

        // 満員なのに観戦者がいなければ、表示順の最後尾を観戦にする。
        let active = getCurrentLobbyMembers();

        let watchers = active
            .filter(person => getLobbyState(person) === "watching")
            .sort(ypCompareParticipantOrder);

        if (
            active.length >= capacity &&
            watchers.length === 0
        ) {
            const lastPerson = active
                .filter(person => getLobbyState(person) === "playing")
                .sort(ypCompareParticipantOrder)
                .at(-1);

            if (lastPerson) {
                await ypSetLobbyStateDirect(lastPerson, "watching");
            }
        }

        // 観戦が複数なら表示順の最後尾1人だけを観戦に残す。
        active = getCurrentLobbyMembers();

        watchers = active
            .filter(person => getLobbyState(person) === "watching")
            .sort(ypCompareParticipantOrder);

        if (watchers.length > 1) {
            const keepWatchingId = watchers[watchers.length - 1].id;

            for (const watcher of watchers) {
                if (watcher.id !== keepWatchingId) {
                    await ypSetLobbyStateDirect(watcher, "playing");
                }
            }
        }

        // ローカルに反映した状態で管理画面を再描画する。
        // ここでloadParticipantsを呼ぶと、自動補充の繰り返しになるため呼ばない。
        if (typeof render === "function") {
            render();
        }

    } catch (error) {
        console.error(
            "[YP-Manager] 待機列からの自動補充エラー:",
            error
        );
    } finally {
        ypAutoLobbyBusy = false;
    }
}


// ========================================
// 一括試合終了＋1：試合数・観戦交代・待機列補充
// ========================================

async function ypFinishOneMatchAndRotate() {
    if (
        !currentSessionId ||
        ypRoundRotationBusy
    ) {
        return;
    }

    const playingAtStart = participants
        .filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status === "playing" &&
                getLobbyState(person) === "playing"
        )
        .sort(ypCompareParticipantOrder);

    if (playingAtStart.length === 0) {
        alert("現在、試合数を進める参加中メンバーはいません。");
        return;
    }

    const watchersAtStart = participants
        .filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status === "playing" &&
                getLobbyState(person) === "watching"
        )
        .sort(ypCompareParticipantOrder);

    const capacity = Number(getRoomCapacity());

    const capacityNote =
        Number.isFinite(capacity) && capacity >= 2
            ? `\nロビー定員：${capacity}人（参加中最大${capacity - 1}人＋観戦1人）`
            : "\n※定員が確認できない場合、自動補充は行いません。";

    const confirmed = confirm(
        `現在参加中の${playingAtStart.length}人の試合数を全員＋1します。` +
        "\n観戦中の人は試合数に含めません。" +
        "\n2試合終了した人は再参加待機へ移動します。" +
        "\n観戦枠を交代し、空きは待機列の先頭から自動補充します。" +
        capacityNote +
        "\n\n実行しますか？"
    );

    if (!confirmed) {
        return;
    }

    ypRoundRotationBusy = true;
    ypAutoLobbySuppress = true;

    let successCount = 0;
    let finishedTwoCount = 0;

    const failedNames = [];

    try {
        // 1. 今回参加していた人だけ試合数を増やす。
        // 2試合になった人は元の履歴を終了扱いにし、再参加待ちを作る。
        for (const person of playingAtStart) {
            try {
                const nextCount = Math.min(
                    2,
                    getMatchCount(person) + 1
                );

                if (nextCount <= getMatchCount(person)) {
                    continue;
                }

                if (nextCount >= 2) {
                    const { data: finishedRows, error: finishError } =
                        await supabaseClient
                            .from("participants")
                            .update({
                                status: "finished",
                                lobby_state: "exchange",
                                match_count: 2,
                                first_participation_pending: false,
                                room_id: null
                            })
                            .eq("id", person.id)
                            .eq("session_id", currentSessionId)
                            .eq("status", "playing")
                            .select("id");

                    if (finishError) {
                        throw finishError;
                    }

                    if (!finishedRows || finishedRows.length === 0) {
                        throw new Error("参加者を2試合終了にできませんでした。");
                    }

                    // 次の再参加待機エントリーが一つ前の順番と重ならないよう、
                    // 作成のたびに参加者データを取り直す。
                    if (typeof ypOriginalLoadParticipants === "function") {
                        await ypOriginalLoadParticipants();
                    }

                    if (!(await createRejoinEntry(person))) {
                        throw new Error("再参加待機への登録に失敗しました。");
                    }

                    finishedTwoCount += 1;

                    if (typeof ypOriginalLoadParticipants === "function") {
                        await ypOriginalLoadParticipants();
                    }

                } else {
                    const { error } = await supabaseClient
                        .from("participants")
                        .update({
                            match_count: nextCount,
                            first_participation_pending: false,
                            lobby_state: "playing",
                            status: "playing"
                        })
                        .eq("id", person.id)
                        .eq("session_id", currentSessionId)
                        .eq("status", "playing");

                    if (error) {
                        throw error;
                    }
                }

                successCount += 1;

            } catch (error) {
                console.error(
                    "[YP-Manager] 試合数＋1処理エラー:",
                    person.name,
                    error
                );

                failedNames.push(person.name || "名前不明");
            }
        }

        if (typeof ypOriginalLoadParticipants === "function") {
            await ypOriginalLoadParticipants();
        }

        // 以前の観戦者を参加中へ移す。
        // 前の参加中メンバーの最後尾を次の観戦者候補にする。
        if (watchersAtStart.length > 0) {
            for (const oldWatcher of watchersAtStart) {
                const currentWatcher = participants.find(
                    person =>
                        person.id === oldWatcher.id &&
                        person.status === "playing" &&
                        getLobbyState(person) === "watching"
                );

                if (currentWatcher) {
                    await ypSetLobbyStateDirect(
                        currentWatcher,
                        "playing"
                    );
                }
            }

            const survivingOriginalPlayers = playingAtStart
                .map(
                    oldPerson => participants.find(
                        person =>
                            person.id === oldPerson.id &&
                            person.status === "playing" &&
                            getLobbyState(person) === "playing"
                    )
                )
                .filter(Boolean)
                .sort(ypCompareParticipantOrder);

            const nextWatcher = survivingOriginalPlayers.at(-1);
            const activeAfterPromotion = getCurrentLobbyMembers().length;
            const queuedCount = ypGetSortedWaitingQueue().length;

            // 次ラウンドも定員まで埋められる時だけ、元の参加者の最後尾を観戦に回す。
            // その人が2試合終了で待機へ移動済みなら、補充後の最後尾が観戦になる。
            if (
                nextWatcher &&
                Number.isFinite(capacity) &&
                capacity >= 2 &&
                activeAfterPromotion + queuedCount >= capacity
            ) {
                await ypSetLobbyStateDirect(
                    nextWatcher,
                    "watching"
                );
            }
        }

        if (typeof ypOriginalLoadParticipants === "function") {
            await ypOriginalLoadParticipants();
        }

        // 自動補充を再開。空いた枠へ待機列の先頭から移す。
        ypAutoLobbySuppress = false;

        await ypAutoFillLobby();

        if (typeof render === "function") {
            render();
        }

        if (failedNames.length === 0) {
            alert(
                `${successCount}人の試合数を更新しました。` +
                `\n${finishedTwoCount}人が2試合終了となり、再参加待機へ移動しました。` +
                "\n観戦枠の交代と、待機列からの自動補充を実行しました。"
            );
        } else {
            alert(
                `${successCount}人の処理が完了しました。` +
                `\n${finishedTwoCount}人が2試合終了となりました。` +
                "\n自動交代・補充を実行しました。" +
                `\n\n処理できなかった参加者：\n${failedNames.join("、")}`
            );
        }

    } catch (error) {
        console.error(
            "[YP-Manager] ラウンド交代エラー:",
            error
        );

        alert(
            "試合終了後の自動交代でエラーが発生しました。" +
            "\n管理画面の表示と、参加者の状態を確認してください。"
        );

    } finally {
        ypAutoLobbySuppress = false;
        ypRoundRotationBusy = false;

        if (typeof ypOriginalLoadParticipants === "function") {
            await ypOriginalLoadParticipants();
        }

        // 最終状態を読み込んだ後に、自動補充を再判定。
        setTimeout(
            () => ypAutoFillLobby(),
            0
        );
    }
}


// ========================================
// 既存の一括試合終了＋1ボタンを置き換える
// 元のクリックイベントを取り除き、新しい処理を設定する。
// ========================================

function ypReplaceBulkFinishButton() {
    const originalButton = document.getElementById(
        "bulkFinishOneMatchButton"
    );

    if (
        !originalButton ||
        originalButton.dataset.ypRotationBound === "true"
    ) {
        return;
    }

    const replacement = originalButton.cloneNode(true);

    replacement.dataset.ypRotationBound = "true";

    replacement.textContent =
        "🎮 今の試合終了（試合数＋1・自動交代）";

    originalButton.replaceWith(replacement);

    replacement.addEventListener(
        "click",
        ypFinishOneMatchAndRotate
    );
}


// ========================================
// 部屋ごとの定員変更ボタンを追加
// 有効な部屋のcapacity合計がロビー定員になる。
// ========================================

async function ypChangeRoomCapacity(room, button) {
    if (!room || !currentSessionId) {
        alert("現在の配信セッションが確認できません。");
        return;
    }

    const currentCapacity = Number(room.capacity) || 9;

    const answer = window.prompt(
        `${room.name} の定員を入力してください。\n` +
        "定員N人の場合、満員時は参加中N-1人＋観戦1人になります。\n" +
        "設定できる範囲：2～50人",
        String(currentCapacity)
    );

    if (answer === null) {
        return;
    }

    const newCapacity = Number(String(answer).trim());

    if (
        !Number.isInteger(newCapacity) ||
        newCapacity < 2 ||
        newCapacity > 50
    ) {
        alert("定員は2～50の整数で入力してください。");
        return;
    }

    if (newCapacity === currentCapacity) {
        return;
    }

    const totalCapacityBefore = Number(getRoomCapacity());

    const totalCapacityAfter =
        totalCapacityBefore - currentCapacity + newCapacity;

    const lobbyCount = getCurrentLobbyMembers().length;

    if (totalCapacityAfter < lobbyCount) {
        const confirmed = window.confirm(
            `現在ロビーには${lobbyCount}人いますが、変更後の定員合計は${totalCapacityAfter}人になります。\n` +
            "すでにロビーにいる人は自動退出させません。空きができるまで新規の自動参加は止まります。\n" +
            "この定員に変更しますか？"
        );

        if (!confirmed) {
            return;
        }
    }

    if (button) {
        button.disabled = true;
        button.textContent = "保存中…";
    }

    try {
        const { error } = await supabaseClient
            .from("rooms")
            .update({
                capacity: newCapacity
            })
            .eq("id", room.id)
            .eq("session_id", currentSessionId)
            .eq("is_active", true);

        if (error) {
            throw error;
        }

        if (typeof loadRooms === "function") {
            await loadRooms();
        }

        if (typeof ypOriginalLoadParticipants === "function") {
            await ypOriginalLoadParticipants();
        }

        await ypAutoFillLobby();

        alert(
            `${room.name} の定員を${newCapacity}人に変更しました。\n` +
            `参加中最大${newCapacity - 1}人＋観戦1人です。`
        );

    } catch (error) {
        console.error(
            "[YP-Manager] 定員変更エラー:",
            error
        );

        alert(
            "定員を変更できませんでした。Supabaseの権限や通信を確認してください。"
        );

    } finally {
        if (button) {
            button.disabled = false;
        }

        setTimeout(
            ypDecorateRoomCapacityButtons,
            0
        );
    }
}


function ypDecorateRoomCapacityButtons() {
    if (
        typeof roomList === "undefined" ||
        !roomList ||
        !Array.isArray(rooms)
    ) {
        return;
    }

    const cards = Array.from(roomList.children).filter(
        card => card.classList.contains("person")
    );

    rooms.forEach((room, index) => {
        const card = cards[index];

        if (!card) {
            return;
        }

        const buttonsBox = card.querySelector(".buttons");

        if (!buttonsBox) {
            return;
        }

        let button = buttonsBox.querySelector(
            ".yp-capacity-button"
        );

        if (!button) {
            button = document.createElement("button");

            button.type = "button";
            button.className = "move yp-capacity-button";

            const closeButton = Array.from(buttonsBox.children).find(
                child =>
                    child.textContent.includes("部屋を閉じる")
            );

            if (closeButton) {
                buttonsBox.insertBefore(button, closeButton);
            } else {
                buttonsBox.appendChild(button);
            }
        }

        // 同じ文字列を再設定しない。MutationObserverの無限通知を防ぐ。
        const label = `👥 定員変更 (${room.capacity}人)`;

        if (button.textContent !== label) {
            button.textContent = label;
        }

        // 部屋データが更新されたときに最新のroomを参照する。
        button.onclick = () => ypChangeRoomCapacity(room, button);
    });
}


// ========================================
// loadParticipants完了後に空き枠を自動補充
// ========================================

if (typeof ypOriginalLoadParticipants === "function") {
    window.loadParticipants = async function ypLoadParticipantsWithAutoFill(...args) {
        const result =
            await ypOriginalLoadParticipants.apply(this, args);

        if (
            !ypAutoLobbySuppress &&
            !ypAutoLobbyBusy
        ) {
            setTimeout(
                () => {
                    if (
                        !ypAutoLobbySuppress &&
                        !ypAutoLobbyBusy
                    ) {
                        ypAutoFillLobby();
                    }
                },
                0
            );
        }

        return result;
    };
}


// ========================================
// 初回接続：ボタンと定員UIをセットアップ
// ========================================

setTimeout(() => {
    ypReplaceBulkFinishButton();
    ypDecorateRoomCapacityButtons();
    ypAutoFillLobby();
}, 1000);


// 部屋カードはrooms.jsが描画し直すため、その変更後にも定員ボタンを付ける。
if (
    typeof roomList !== "undefined" &&
    roomList
) {
    const ypRoomObserver = new MutationObserver(() => {
        ypDecorateRoomCapacityButtons();
    });

    ypRoomObserver.observe(
        roomList,
        {
            childList: true,
            subtree: true
        }
    );
}


// 既存管理画面の定期更新と併せて定員ボタンの表示も整える。
setInterval(() => {
    ypReplaceBulkFinishButton();
    ypDecorateRoomCapacityButtons();
}, 3000);