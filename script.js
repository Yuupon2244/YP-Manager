// ========================================
// YP-Manager 管理画面 v1.3.4
// ========================================
// ========================================
// Supabase接続
// ========================================
const SUPABASE_URL =
    "https://ilmiebokwfccybrtduxy.supabase.co";
const SUPABASE_KEY =
    "sb_publishable_tl-vkXmtiYn_f1VtPy689A_dwKCdYg5";
const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );
// ========================================
// HTML要素
// ========================================
const nameInput =
    document.getElementById(
        "nameInput"
    );
const addButton =
    document.getElementById(
        "addButton"
    );
const sessionStatus =
    document.getElementById(
        "sessionStatus"
    );
const rejoinToggle =
    document.getElementById(
        "rejoinToggle"
    );
const waitingList =
    document.getElementById(
        "waitingList"
    );
const playingList =
    document.getElementById(
        "playingList"
    );
const finishAllPlayingButton =
    document.getElementById(
        "finishAllPlayingButton"
    );
const finishedList =
    document.getElementById(
        "finishedList"
    );
const cancelledList =
    document.getElementById(
        "cancelledList"
    );
// ========================================
// データ
// ========================================
let participants = [];
let currentSessionId = null;
let rejoinEnabled = false;
// ========================================
// URL参加通知
// ========================================
const urlJoinNotification =
    document.getElementById(
        "urlJoinNotification"
    );
// 好きなSEを使う場合は、音声ファイルを同じフォルダへ置き、
// 例："notification.mp3" のようにファイル名を指定する。
// 空欄の場合は、追加ファイル不要の標準ピコン音を使用する。
const URL_JOIN_SOUND_FILE = "";
let urlNotificationInitialized =
    false;
let knownUrlParticipantIds =
    new Set();
let notificationHideTimer =
    null;
let notificationAudioContext =
    null;
function unlockNotificationAudio() {
    try {
        if (
            !notificationAudioContext
        ) {
            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;
            if (
                AudioContextClass
            ) {
                notificationAudioContext =
                    new AudioContextClass();
            }
        }
        if (
            notificationAudioContext
                ?.state ===
            "suspended"
        ) {
            notificationAudioContext.resume();
        }
    } catch (error) {
        console.warn(
            "通知音の準備に失敗:",
            error
        );
    }
}
window.addEventListener(
    "pointerdown",
    unlockNotificationAudio,
    {
        once:
            true
    }
);
function playDefaultNotificationSound() {
    unlockNotificationAudio();
    if (
        !notificationAudioContext
    ) {
        return;
    }
    const now =
        notificationAudioContext
            .currentTime;
    const gain =
        notificationAudioContext
            .createGain();
    gain.gain.setValueAtTime(
        0.0001,
        now
    );
    gain.gain
        .exponentialRampToValueAtTime(
            0.22,
            now + 0.02
        );
    gain.gain
        .exponentialRampToValueAtTime(
            0.0001,
            now + 0.55
        );
    gain.connect(
        notificationAudioContext
            .destination
    );
    [
        {
            frequency:
                880,
            start:
                0,
            duration:
                0.18
        },
        {
            frequency:
                1320,
            start:
                0.16,
            duration:
                0.32
        }
    ].forEach(
        tone => {
            const oscillator =
                notificationAudioContext
                    .createOscillator();
            oscillator.type =
                "sine";
            oscillator.frequency
                .setValueAtTime(
                    tone.frequency,
                    now + tone.start
                );
            oscillator.connect(
                gain
            );
            oscillator.start(
                now + tone.start
            );
            oscillator.stop(
                now +
                tone.start +
                tone.duration
            );
        }
    );
}
async function playUrlJoinSound() {
    if (
        !URL_JOIN_SOUND_FILE
    ) {
        playDefaultNotificationSound();
        return;
    }
    try {
        const audio =
            new Audio(
                URL_JOIN_SOUND_FILE
            );
        audio.volume =
            0.8;
        await audio.play();
    } catch (error) {
        console.warn(
            "指定SEを再生できないため標準音を使用:",
            error
        );
        playDefaultNotificationSound();
    }
}
function showUrlJoinNotification(
    name
) {
    if (
        !urlJoinNotification
    ) {
        return;
    }
    urlJoinNotification.textContent =
        `🔔 URL参加：${name}`;
    urlJoinNotification
        .classList
        .add(
            "show"
        );
    clearTimeout(
        notificationHideTimer
    );
    notificationHideTimer =
        setTimeout(
            () => {
                urlJoinNotification
                    .classList
                    .remove(
                        "show"
                    );
            },
            5000
        );
}
function detectNewUrlParticipants(
    nextParticipants
) {
    const currentUrlParticipants =
        nextParticipants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.source ===
                    "url" &&
                person.status ===
                    "waiting"
        );
    const currentIds =
        new Set(
            currentUrlParticipants.map(
                person =>
                    person.id
            )
        );
    if (
        !urlNotificationInitialized
    ) {
        knownUrlParticipantIds =
            currentIds;
        urlNotificationInitialized =
            true;
        return;
    }
    const newParticipants =
        currentUrlParticipants.filter(
            person =>
                !knownUrlParticipantIds
                    .has(
                        person.id
                    )
        );
    knownUrlParticipantIds =
        currentIds;
    newParticipants.forEach(
        person => {
            playUrlJoinSound();
            showUrlJoinNotification(
                person.name ||
                "名前不明"
            );
        }
    );
}
function resetUrlParticipantNotification() {
    urlNotificationInitialized =
        false;
    knownUrlParticipantIds.clear();
}
// ========================================
// 待機順の基準値
// ========================================
const INITIAL_ORDER_BASE =
    1;
const REJOIN_ORDER_BASE =
    1000000;
// ========================================
// 日時表示
// ========================================
function formatDate(
    dateValue
) {
    if (
        !dateValue
    ) {
        return "";
    }
    return new Date(
        dateValue
    ).toLocaleString(
        "ja-JP"
    );
}
// ========================================
// 再参加受付設定
// ========================================
async function loadRejoinSetting() {
    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "app_settings"
            )
            .select(
                "value"
            )
            .eq(
                "key",
                "rejoin_enabled"
            )
            .maybeSingle();
    if (
        error
    ) {
        console.error(
            "再参加設定取得エラー:",
            error
        );
        return;
    }
    if (
        !data
    ) {
        const {
            error: insertError
        } =
            await supabaseClient
                .from(
                    "app_settings"
                )
                .insert([
                    {
                        key:
                            "rejoin_enabled",
                        value:
                            "false",
                        updated_at:
                            new Date()
                                .toISOString()
                    }
                ]);
        if (
            insertError
        ) {
            console.error(
                "再参加設定作成エラー:",
                insertError
            );
            return;
        }
        rejoinEnabled =
            false;
    } else {
        rejoinEnabled =
            String(
                data.value
            ) ===
            "true";
    }
    renderRejoinToggle();
}
// ========================================
// 再参加ボタン表示
// ========================================
function renderRejoinToggle() {
    if (
        rejoinEnabled
    ) {
        rejoinToggle.textContent =
            "🔓 再参加受付 ON";
        rejoinToggle.style.background =
            "#39b54a";
        rejoinToggle.style.color =
            "white";
    } else {
        rejoinToggle.textContent =
            "🔒 再参加受付 OFF";
        rejoinToggle.style.background =
            "#555";
        rejoinToggle.style.color =
            "white";
    }
}
// ========================================
// 再参加受付切り替え
// ========================================
async function toggleRejoin() {
    const newValue =
        !rejoinEnabled;
    rejoinToggle.disabled =
        true;
    rejoinToggle.textContent =
        "変更中…";
    const {
        error
    } =
        await supabaseClient
            .from(
                "app_settings"
            )
            .upsert(
                {
                    key:
                        "rejoin_enabled",
                    value:
                        String(
                            newValue
                        ),
                    updated_at:
                        new Date()
                            .toISOString()
                },
                {
                    onConflict:
                        "key"
                }
            );
    rejoinToggle.disabled =
        false;
    if (
        error
    ) {
        console.error(
            "再参加設定変更エラー:",
            error
        );
        alert(
            "再参加受付を変更できませんでした。"
        );
        renderRejoinToggle();
        return;
    }
    rejoinEnabled =
        newValue;
    renderRejoinToggle();
}
rejoinToggle.addEventListener(
    "click",
    toggleRejoin
);
// ========================================
// 現在の配信IDを取得
// ========================================
async function loadCurrentSession() {
    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "app_settings"
            )
            .select(
                "value"
            )
            .eq(
                "key",
                "current_session_id"
            )
            .maybeSingle();
    if (
        error
    ) {
        console.error(
            "現在配信取得エラー:",
            error
        );
        currentSessionId =
            null;
        sessionStatus.textContent =
            "⚠️ 現在の配信を取得できません";
        disableAdminInput();
        return false;
    }
    if (
        !data ||
        !data.value
    ) {
        currentSessionId =
            null;
        sessionStatus.textContent =
            "⚠️ 現在受付中の配信がありません";
        disableAdminInput();
        return false;
    }
    currentSessionId =
        String(
            data.value
        ).trim();
    sessionStatus.textContent =
        `📡 現在の配信：${currentSessionId}`;
    enableAdminInput();
    return true;
}
// ========================================
// 手動追加欄
// ========================================
function disableAdminInput() {
    nameInput.disabled =
        true;
    addButton.disabled =
        true;
}
function enableAdminInput() {
    nameInput.disabled =
        false;
    addButton.disabled =
        false;
}
// ========================================
// 現在配信の参加者だけ読み込み
// ========================================
async function loadParticipants() {
    if (!currentSessionId) {
        participants = [];
        render();
        return;
    }
    const {
        data,
        error
    } = await supabaseClient
        .from("participants")
        .select("*")
        .eq("session_id", currentSessionId)
        .order("display_order", {
            ascending: true,
            nullsFirst: false
        })
        .order("joined_at", {
            ascending: true
        });
    if (error) {
        console.error(
            "参加者読み込みエラー:",
            error
        );
        return;
    }
    const nextParticipants =
        (data || []).map(person => ({
            ...person,
            match_count:
                getMatchCount(person),
            first_participation_pending:
                person.first_participation_pending === true ||
                (
                    person.first_participation_pending == null &&
                    person.note === "initial"
                ),
            lobby_state:
                isChatOnlyPerson(person)
                    ? "watching"
                    : person.lobby_state === "watching"
                        ? "watching"
                        : person.lobby_state === "playing"
                            ? "playing"
                            : person.status === "playing"
                                ? "playing"
                                : person.status === "viewer"
                                    ? "watching"
                                    : person.lobby_state || "waiting"
        }));
    detectNewUrlParticipants(
        nextParticipants
    );
    participants =
        nextParticipants;
    render();
}
// ========================================
// 空欄表示
// ========================================
function showEmpty(
    element,
    text
) {
    const box =
        document.createElement(
            "div"
        );
    box.className =
        "person";
    box.textContent =
        text;
    element.appendChild(
        box
    );
}
// ========================================
// 共通参加者カード
// ========================================
function createPersonBox(
    person
) {
    const personBox =
        document.createElement(
            "div"
        );
    personBox.className =
        "person";
    const nameBox =
        document.createElement(
            "div"
        );
    nameBox.className =
        "name";
    const typeBadge =
        document.createElement(
            "span"
        );
    const isRejoin =
        person.note ===
            "rejoin" ||
        (
            person.note !==
                "initial" &&
            Number.isFinite(
                Number(
                    person.display_order
                )
            ) &&
            Number(
                person.display_order
            ) >=
                1000000
        );
    const isInitial =
        person.note ===
            "initial" ||
        (
            person.note !==
                "rejoin" &&
            Number.isFinite(
                Number(
                    person.display_order
                )
            ) &&
            Number(
                person.display_order
            ) <
                1000000
        );
    if (
        isRejoin
    ) {
        typeBadge.textContent =
            "🔁 再参加";
        typeBadge.style.background =
            "#7b5bd6";
    } else if (
        isInitial
    ) {
        typeBadge.textContent =
            "🆕 初参加";
        typeBadge.style.background =
            "#2f9e63";
    }
    if (
        isRejoin ||
        isInitial
    ) {
        typeBadge.style.display =
            "inline-block";
        typeBadge.style.marginLeft =
            "8px";
        typeBadge.style.padding =
            "2px 7px";
        typeBadge.style.borderRadius =
            "999px";
        typeBadge.style.fontSize =
            "12px";
        typeBadge.style.fontWeight =
            "bold";
        typeBadge.style.color =
            "white";
        typeBadge.style.verticalAlign =
            "middle";
    }
    nameBox.textContent =
        person.name;
    if (
        isRejoin ||
        isInitial
    ) {
        nameBox.appendChild(
            typeBadge
        );
    }
    const dateBox =
        document.createElement(
            "div"
        );
    dateBox.className =
        "date";
    const sourceText =
        person.source
            ? ` / ${person.source}`
            : "";
    dateBox.textContent =
        `${formatDate(
            person.joined_at
        )}${sourceText}`;
    const gameNameBox =
        document.createElement(
            "div"
        );
    gameNameBox.className =
        person.game_name
            ? "game-name game-name-set"
            : "game-name game-name-empty";
    gameNameBox.textContent =
        person.game_name
            ? `🎮 スプラ名：${person.game_name}`
            : "🎮 スプラ名：未登録";
    const buttonsBox =
        document.createElement(
            "div"
        );
    buttonsBox.className =
        "buttons";
    personBox.appendChild(
        nameBox
    );
    personBox.appendChild(
        dateBox
    );
    personBox.appendChild(
        gameNameBox
    );
    personBox.appendChild(
        buttonsBox
    );
    buttonsBox.appendChild(
        createButton(
            person.game_name
                ? "🎮 スプラ名を変更"
                : "🎮 スプラ名を登録",
            "move",
            () =>
                updateGameName(
                    person
                )
        )
    );
    buttonsBox.appendChild(
        createButton(
            "− 試合数",
            "move",
            () =>
                adjustMatchCount(
                    person,
                    -1
                )
        )
    );
    buttonsBox.appendChild(
        createButton(
            "＋ 試合数",
            "move",
            () =>
                adjustMatchCount(
                    person,
                    1
                )
        )
    );
    updateMatchDisplay(
        personBox,
        person
    );
    return {
        personBox,
        buttonsBox
    };
}
// ========================================
// ボタン生成
// ========================================
function createButton(
    text,
    className,
    onClick
) {
    const button =
        document.createElement(
            "button"
        );
    button.textContent =
        text;
    button.className =
        className;
    button.onclick =
        onClick;
    return button;
}
// ========================================
// 初参加・再参加判定
// ========================================
function isRejoinPerson(
    person
) {
    return (
        person.note ===
            "rejoin" ||
        (
            person.note !==
                "initial" &&
            Number.isFinite(
                Number(
                    person.display_order
                )
            ) &&
            Number(
                person.display_order
            ) >=
                REJOIN_ORDER_BASE
        )
    );
}
function isInitialPerson(
    person
) {
    return !isRejoinPerson(
        person
    );
}
// ========================================
// スプラ名を登録・変更
// ========================================
async function updateGameName(
    person
) {
    const input =
        window.prompt(
            `${person.name}さんのスプラ名を入力してください。\n空欄で保存すると登録を解除します。`,
            person.game_name ||
            ""
        );
    if (
        input === null
    ) {
        return;
    }
    const gameName =
        input.trim();
    if (
        gameName.length >
        30
    ) {
        alert(
            "スプラ名は30文字以内で入力してください。"
        );
        return;
    }
    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                game_name:
                    gameName ||
                    null
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "session_id",
                currentSessionId
            );
    if (
        error
    ) {
        console.error(
            "スプラ名保存エラー:",
            error
        );
        alert(
            "スプラ名を保存できませんでした。"
        );
        return;
    }
    await loadParticipants();
}
// ========================================
// グループ最後尾の順番
// ========================================
function getNextOrderForGroup(
    isRejoin,
    excludeId = null
) {
    const orders =
        participants
            .filter(
                person =>
                    !isChatOnlyPerson(person) &&
                    person.status ===
                        "waiting" &&
                    person.id !==
                        excludeId &&
                    (
                        isRejoin
                            ? isRejoinPerson(
                                person
                            )
                            : isInitialPerson(
                                person
                            )
                    )
            )
            .map(
                person =>
                    Number(
                        person.display_order
                    )
            )
            .filter(
                order =>
                    Number.isFinite(
                        order
                    )
            );
    if (
        isRejoin
    ) {
        const rejoinOrders =
            orders.filter(
                order =>
                    order >=
                    REJOIN_ORDER_BASE
            );
        if (
            rejoinOrders.length ===
            0
        ) {
            return REJOIN_ORDER_BASE;
        }
        return (
            Math.max(
                ...rejoinOrders
            ) + 1
        );
    }
    const initialOrders =
        orders.filter(
            order =>
                order <
                REJOIN_ORDER_BASE
        );
    if (
        initialOrders.length ===
        0
    ) {
        return INITIAL_ORDER_BASE;
    }
    return (
        Math.max(
            ...initialOrders
        ) + 1
    );
}
// ========================================
// ロビー・試合管理
// ========================================
function getMatchCount(
    person
) {
    const count =
        Number(
            person?.match_count
        );
    if (
        Number.isFinite(
            count
        )
    ) {
        return Math.max(
            0,
            Math.min(
                2,
                count
            )
        );
    }
    return 0;
}
function isChatOnlyPerson(
    person
) {
    return (
        person?.chat_only === true ||
        person?.status === "chat_only" ||
        person?.lobby_state === "chat_only" ||
        person?.source === "chat" ||
        person?.note === "chat_only" ||
        person?.note === "viewer"
    );
}
function getLobbyState(
    person
) {
    if (
        isChatOnlyPerson(person)
    ) {
         return "chat_only";
    }
    if (
        person?.lobby_state ===
        "watching"
    ) {
        return "watching";
    }
    if (
        person?.lobby_state ===
        "playing"
    ) {
        return "playing";
    }
    if (
        person?.status ===
        "viewer"
    ) {
        return "watching";
    }
    if (
        person?.status ===
        "playing"
    ) {
        return "playing";
    }
    if (
        person?.lobby_state ===
            "exchange" ||
        getMatchCount(
            person
        ) >=
        2
    ) {
        return "exchange";
    }
    return "waiting";
}
function getStateInfo(
    person
) {
    const state =
        getLobbyState(
            person
        );
    if (
        state ===
        "playing"
    ) {
        return {
            icon:
                "🟢",
            label:
                "参加中",
            text:
                "🟢 参加中"
        };
    }
    if (
        state ===
        "watching"
    ) {
        return {
            icon:
                "👀",
            label:
                "観戦",
            text:
                "👀 観戦"
        };
    }
    if (
        state ===
        "exchange"
    ) {
        return {
            icon:
                "🔄",
            label:
                "交代待ち",
            text:
                "🔄 交代待ち"
        };
    }
    if (
        person?.first_participation_pending
    ) {
        return {
            icon:
                "🆕",
            label:
                "初見",
            text:
                "🆕 初見"
        };
    }
    return {
        icon:
            "⏳",
        label:
            "待機",
        text:
            "⏳ 待機"
    };
}
function getRoomCapacity() {
    const activeRooms =
        typeof rooms !== "undefined" &&
        Array.isArray(rooms)
            ? rooms
            : Array.isArray(
                window.rooms
            )
                ? window.rooms
                : [];
    return activeRooms
        .filter(
            room =>
                room &&
                room.is_active !==
                    false
        )
        .reduce(
            (
                total,
                room
            ) => {
                const capacity =
                    Number(
                        room.capacity
                    );
                return (
                    total +
                    (
                        Number.isFinite(
                            capacity
                        )
                            ? Math.max(
                                0,
                                capacity
                            )
                            : 0
                    )
                );
            },
            0
        );
}
function getCurrentLobbyMembers() {
    return participants.filter(
        person => {
            const state =
                getLobbyState(
                    person
                );
            return (
                !isChatOnlyPerson(person) &&
                (
                    state ===
                        "playing" ||
                    state ===
                        "watching"
                )
            );
        }
    );
}
function getExchangeWaiting() {
    return participants.filter(
        person =>
            !isChatOnlyPerson(person) &&
            getLobbyState(
                person
            ) ===
                "exchange" &&
            person.status !==
                "finished" &&
            person.status !==
                "cancelled"
    );
}
function getNextCandidates(
    limit = 3
) {
    const waiting =
        participants
            .filter(
                person =>
                    !isChatOnlyPerson(person) &&
                    person.status ===
                        "waiting"
            )
            .sort(
                (
                    a,
                    b
                ) => {
                    const ao =
                        Number(
                            a.display_order
                        );
                    const bo =
                        Number(
                            b.display_order
                        );
                    if (
                        Number.isFinite(
                            ao
                        ) &&
                        Number.isFinite(
                            bo
                        )
                    ) {
                        return ao - bo;
                    }
                    if (
                        Number.isFinite(
                            ao
                        )
                    ) {
                        return -1;
                    }
                    if (
                        Number.isFinite(
                            bo
                        )
                    ) {
                        return 1;
                    }
                    return String(
                        a.joined_at ||
                        ""
                    ).localeCompare(
                        String(
                            b.joined_at ||
                            ""
                        )
                    );
                }
            );
    const newcomers =
        waiting.filter(
            person =>
                person.first_participation_pending
        );
    const exchange =
        waiting.filter(
            person =>
                getLobbyState(
                    person
                ) ===
                    "exchange"
        );
    const normal =
        waiting.filter(
            person =>
                !person.first_participation_pending &&
                getLobbyState(
                    person
                ) !==
                    "exchange"
        );
    return [
        ...newcomers,
        ...exchange,
        ...normal
    ].slice(
        0,
        limit
    );
}
function ensureLobbyDashboard() {
    let dashboard =
        document.getElementById(
            "lobbyDashboard"
        );
    if (
        dashboard
    ) {
        return dashboard;
    }
    if (
        !waitingList ||
        !waitingList.parentElement
    ) {
        return null;
    }
    dashboard =
        document.createElement(
            "div"
        );
    dashboard.id =
        "lobbyDashboard";
    dashboard.style.padding =
        "12px";
    dashboard.style.marginBottom =
        "12px";
    dashboard.style.border =
        "1px solid #ddd";
    dashboard.style.borderRadius =
        "10px";
    dashboard.style.background =
        "#fafafa";
    dashboard.style.lineHeight =
        "1.7";
    waitingList.parentElement.insertBefore(
        dashboard,
        waitingList
    );
    return dashboard;
}
function renderLobbyDashboard() {
    const dashboard =
        ensureLobbyDashboard();
    if (
        !dashboard
    ) {
        return;
    }
    const lobbyMembers =
        getCurrentLobbyMembers();
    const newcomers =
        participants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status ===
                    "waiting" &&
                person.first_participation_pending
        ).length;
    const exchange =
        getExchangeWaiting().length;
    const watching =
        lobbyMembers.filter(
            person =>
                getLobbyState(
                    person
                ) ===
                    "watching"
        ).length;
    const waiting =
        participants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status ===
                    "waiting"
        ).length;
    const capacity =
        getRoomCapacity();
    dashboard.innerHTML =
        "";
    const title =
        document.createElement(
            "div"
        );
    title.textContent =
        capacity > 0
            ? `🏠 現在のロビー ${lobbyMembers.length} / ${capacity}`
            : `🏠 現在のロビー ${lobbyMembers.length}`;
    title.style.fontWeight =
        "bold";
    title.style.marginBottom =
        "8px";
    dashboard.appendChild(
        title
    );
    const stats =
        document.createElement(
            "div"
        );
    stats.textContent =
        `🆕 初見 ${newcomers}　🔄 交代待ち ${exchange}　👀 観戦 ${watching}　⏳ 待機 ${waiting}`;
    stats.style.marginBottom =
        "8px";
    dashboard.appendChild(
        stats
    );
    const nextTitle =
        document.createElement(
            "div"
        );
    nextTitle.textContent =
        "【次に入れる人】";
    nextTitle.style.fontWeight =
        "bold";
    dashboard.appendChild(
        nextTitle
    );
    const candidates =
        getNextCandidates(
            3
        );
    if (
        candidates.length ===
        0
    ) {
        const empty =
            document.createElement(
                "div"
            );
        empty.textContent =
            "現在、次候補はいません";
        dashboard.appendChild(
            empty
        );
    } else {
        candidates.forEach(
            (
                person,
                index
            ) => {
                const row =
                    document.createElement(
                        "div"
                    );
                const info =
                    getStateInfo(
                        person
                    );
                const suffix =
                    person.first_participation_pending
                        ? "・初回参加"
                        : "・待機順";
                row.textContent =
                    `${index + 1}番　${person.name}　${info.text}${suffix}`;
                dashboard.appendChild(
                    row
                );
            }
        );
    }
}
function updateMatchDisplay(
    personBox,
    person
) {
    const matchBox =
        document.createElement(
            "div"
        );
    matchBox.className =
        "date";
    matchBox.textContent =
        `試合数：${getMatchCount(person)} / 2`;
    if (
        getMatchCount(
            person
        ) >=
        2
    ) {
        matchBox.style.fontWeight =
            "bold";
        matchBox.style.color =
            "#c92a2a";
    }
    const state =
        getStateInfo(
            person
        );
    const stateBox =
        document.createElement(
            "div"
        );
    stateBox.className =
        "date";
    stateBox.textContent =
        `状態：${state.text}`;
    personBox.insertBefore(
        matchBox,
        personBox.querySelector(
            ".buttons"
        )
    );
    personBox.insertBefore(
        stateBox,
        personBox.querySelector(
            ".buttons"
        )
    );
}
function isLobbyFull() {
    const capacity =
        getRoomCapacity();
    if (
        capacity <=
        0
    ) {
        return false;
    }
    return (
        getCurrentLobbyMembers()
            .length >=
        capacity
    );
}
async function adjustMatchCount(
    person,
    delta
) {
    if (
        !person ||
        !currentSessionId
    ) {
        return;
    }
    const currentCount =
        getMatchCount(
            person
        );
    const nextCount =
        Math.max(
            0,
            Math.min(
                2,
                currentCount +
                    Number(
                        delta
                    )
            )
        );
    if (
        nextCount ===
        currentCount
    ) {
        return;
    }
    if (
        nextCount >=
        2
    ) {
        await finishTwoGames(
            person
        );
        return;
    }
    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                match_count:
                    nextCount,
                first_participation_pending:
                    false,
                lobby_state:
                    getLobbyState(
                        person
                    )
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "session_id",
                currentSessionId
            );
    if (
        error
    ) {
        console.error(
            "試合数修正エラー:",
            error
        );
        alert(
            "試合数を修正できませんでした。"
        );
        return;
    }
    await loadParticipants();
}
async function setLobbyState(
    id,
    lobbyState,
    status
) {
    if (
        !currentSessionId
    ) {
        return false;
    }
    if (
        lobbyState ===
            "playing" &&
        status ===
            "playing" &&
        isLobbyFull()
    ) {
        const current =
            participants.find(
                person =>
                    person.id ===
                    id
            );
        if (
            getLobbyState(
                current
            ) !==
                "playing" &&
            getLobbyState(
                current
            ) !==
                "watching"
        ) {
            alert(
                "現在のロビーが満員です。"
            );
            return false;
        }
    }
    const patch = {
        status:
            status,
        lobby_state:
            lobbyState
    };
    if (
        lobbyState ===
            "waiting" ||
        lobbyState ===
            "exchange"
    ) {
        patch.room_id =
            null;
    }
    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update(
                patch
            )
            .eq(
                "id",
                id
            )
            .eq(
                "session_id",
                currentSessionId
            );


    if (
        error
    ) {


        console.error(
            "ロビー状態変更エラー:",
            error
        );


        alert(
            "ロビー状態を変更できませんでした。"
        );


        return false;

    }


    return true;

}


async function startMatch(
    person
) {


    if (
        !person ||
        !currentSessionId
    ) {

        return;

    }


    const ok =
        await setLobbyState(
            person.id,
            "playing",
            "playing"
        );


    if (
        !ok
    ) {

        return;

    }


    await supabaseClient
        .from(
            "participants"
        )
        .update({
            first_participation_pending:
                false
        })
        .eq(
            "id",
            person.id
        )
        .eq(
            "session_id",
            currentSessionId
        );


    await loadParticipants();

}


async function finishMatch(
    person
) {


    if (
        !person ||
        !currentSessionId
    ) {

        return;

    }


    const currentCount =
        getMatchCount(
            person
        );


    if (
        currentCount >=
        2
    ) {

        await finishTwoGames(
            person
        );


        return;

    }


    const nextCount =
        currentCount +
        1;


    const isTwo =
        nextCount >=
        2;


    const patch = {


        match_count:
            nextCount,


        first_participation_pending:
            false,


        lobby_state:
            isTwo
                ? "exchange"
                : "playing",


        status:
            isTwo
                ? "finished"
                : "playing"

    };


    if (
        isTwo
    ) {


        patch.room_id =
            null;

    }


    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update(
                patch
            )
            .eq(
                "id",
                person.id
            )
            .eq(
                "session_id",
                currentSessionId
            )
            .eq(
                "status",
                "playing"
            );


    if (
        error
    ) {


        console.error(
            "試合終了エラー:",
            error
        );


        alert(
            "試合終了を記録できませんでした。"
        );


        return;

    }


    if (
        isTwo
    ) {

        await createRejoinEntry(
            person
        );


        alert(
            `${person.name}さんは2/2試合終了です。再参加待機へ移動しました。`
        );

    } else {

        alert(
            `${person.name}さんの試合を1試合終了として記録しました。現在 1/2 試合です。`
        );

    }


    await loadParticipants();

}


async function createRejoinEntry(
    person
) {

    const nextOrder =
        getNextOrderForGroup(
            true
        );


    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .insert([
                {
                    name:
                        person.name,

                    status:
                        "waiting",

                    source:
                        person.source ||
                        "admin",

                    user_id:
                        person.user_id,

                    game_name:
                        person.game_name ||
                        null,

                    display_order:
                        nextOrder,

                    note:
                        "rejoin",

                    session_id:
                        currentSessionId,

                    match_count:
                        0,

                    first_participation_pending:
                        false,

                    lobby_state:
                        "exchange",
                    chat_only:
                        false
                }
            ]);


    if (
        error
    ) {

        console.error(
            "再参加待機追加エラー:",
            error
        );


        alert(
            "2試合終了は記録されましたが、再参加待機への追加に失敗しました。"
        );


        return false;

    }


    return true;

}


async function setWatching(
    person
) {

    if (
        !person
    ) {

        return;

    }


    const ok =
        await setLobbyState(
            person.id,
            "watching",
            "playing"
        );


    if (
        ok
    ) {

        await loadParticipants();

    }

}


async function setPlaying(
    person
) {

    if (
        !person
    ) {

        return;

    }


    await startMatch(
        person
    );

}


async function returnToWaiting(
    person
) {

    if (
        !person
    ) {

        return;

    }


    const rejoin =
        isRejoinPerson(
            person
        );


    const nextOrder =
        getNextOrderForGroup(
            rejoin,
            person.id
        );


    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({

                status:
                    "waiting",

                lobby_state:
                    getMatchCount(
                        person
                    ) >=
                        2
                        ? "exchange"
                        : "waiting",

                room_id:
                    null,

                display_order:
                    nextOrder,

                note:
                    rejoin
                        ? "rejoin"
                        : "initial"

            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "session_id",
                currentSessionId
            );


    if (
        error
    ) {

        console.error(
            "待機復帰エラー:",
            error
        );


        alert(
            "待機列へ戻せませんでした。"
        );


        return;

    }


    await loadParticipants();

}// ========================================
// 表示
// ========================================

function render() {
    waitingList.innerHTML =
        "";

    playingList.innerHTML =
        "";

    finishedList.innerHTML =
        "";

    cancelledList.innerHTML =
        "";

    const waiting =
        participants
            .filter(
                person =>
                    !isChatOnlyPerson(person) &&
                    person.status ===
                    "waiting"
            )
            .sort(
                (
                    a,
                    b
                ) => {
                    const aNew =
                        a.first_participation_pending
                            ? 0
                            : 1;

                    const bNew =
                        b.first_participation_pending
                            ? 0
                            : 1;

                    if (
                        aNew !==
                        bNew
                    ) {
                        return (
                            aNew -
                            bNew
                        );
                    }

                    const ao =
                        Number(
                            a.display_order
                        );

                    const bo =
                        Number(
                            b.display_order
                        );

                    if (
                        Number.isFinite(
                            ao
                        ) &&
                        Number.isFinite(
                            bo
                        )
                    ) {
                        return (
                            ao -
                            bo
                        );
                    }

                    if (
                        Number.isFinite(
                            ao
                        )
                    ) {
                        return -1;
                    }

                    if (
                        Number.isFinite(
                            bo
                        )
                    ) {
                        return 1;
                    }

                    return String(
                        a.joined_at ||
                        ""
                    ).localeCompare(
                        String(
                            b.joined_at ||
                            ""
                        )
                    );
                }
            );

    const playing =
        participants.filter(
            person => {
                if (
                    isChatOnlyPerson(
                        person
                    )
                ) {
                    return false;
                }

                const state =
                    getLobbyState(
                        person
                    );

                return (
                    state ===
                        "playing" ||
                    state ===
                        "watching"
                );
            }
        );

    const watching = [];

    const finished =
        participants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status ===
                "finished"
        );

    const cancelled =
        participants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                person.status ===
                "cancelled"
        );

    waiting.forEach(
        (
            person,
            waitingIndex
        ) => {
            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(
                    person
                );

            const orderBox =
                document.createElement(
                    "div"
                );

            orderBox.className =
                "date";

            orderBox.textContent =
                `現在 ${waitingIndex + 1}番目`;

            personBox.insertBefore(
                orderBox,
                buttonsBox
            );

            buttonsBox.appendChild(
                createButton(
                    "▶ 参加開始",
                    "call",
                    () =>
                        startMatch(
                            person
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "↑",
                    "move",
                    () =>
                        moveWaiting(
                            person.id,
                            -1
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "↓",
                    "move",
                    () =>
                        moveWaiting(
                            person.id,
                            1
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "⏭ 最後尾へ",
                    "move",
                    () =>
                        moveToGroupEnd(
                            person
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "辞退",
                    "delete",
                    () =>
                        cancelPerson(
                            person.id,
                            person.name
                        )
                )
            );

            waitingList.appendChild(
                personBox
            );
        }
    );

    playing.forEach(
        person => {
            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(
                    person
                );

            buttonsBox.appendChild(
                createButton(
                    "⏹ 試合終了",
                    "finish",
                    () =>
                        finishMatch(
                            person
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "🔁 2試合終了",
                    "finish",
                    () =>
                        finishTwoGames(
                            person
                        )
                )
            );

            if (
                getLobbyState(
                    person
                ) ===
                "watching"
            ) {
                buttonsBox.appendChild(
                    createButton(
                        "▶ 参加へ",
                        "call",
                        () =>
                            setPlaying(
                                person
                            )
                    )
                );
            } else {
                buttonsBox.appendChild(
                    createButton(
                        "👀 観戦へ",
                        "move",
                        () =>
                            setWatching(
                                person
                            )
                    )
                );
            }

            buttonsBox.appendChild(
                createButton(
                    "削除",
                    "delete",
                    () =>
                        deletePerson(
                            person.id,
                            person.name
                        )
                )
            );

            playingList.appendChild(
                personBox
            );
        }
    );

    watching.forEach(
        person => {
            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(
                    person
                );

            buttonsBox.appendChild(
                createButton(
                    "▶ 参加へ",
                    "call",
                    () =>
                        setPlaying(
                            person
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "🔄 交代待ち",
                    "move",
                    () =>
                        returnToWaiting(
                            person
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "削除",
                    "delete",
                    () =>
                        deletePerson(
                            person.id,
                            person.name
                        )
                )
            );

            playingList.appendChild(
                personBox
            );
        }
    );

    finished.forEach(
        person => {
            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(
                    person
                );

            buttonsBox.appendChild(
                createButton(
                    "🔄 再参加待機へ",
                    "call",
                    () =>
                        restorePerson(
                            person.id
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "削除",
                    "delete",
                    () =>
                        deletePerson(
                            person.id,
                            person.name
                        )
                )
            );

            finishedList.appendChild(
                personBox
            );
        }
    );

    cancelled.forEach(
        person => {
            const {
                personBox,
                buttonsBox
            } =
                createPersonBox(
                    person
                );

            buttonsBox.appendChild(
                createButton(
                    "待機に戻す",
                    "call",
                    () =>
                        restorePerson(
                            person.id
                        )
                )
            );

            buttonsBox.appendChild(
                createButton(
                    "削除",
                    "delete",
                    () =>
                        deletePerson(
                            person.id,
                            person.name
                        )
                )
            );

            cancelledList.appendChild(
                personBox
            );
        }
    );

    if (
        waiting.length ===
        0
    ) {
        showEmpty(
            waitingList,
            "現在、待機者はいません"
        );
    }

    if (
        playing.length ===
            0 &&
        watching.length ===
            0
    ) {
        showEmpty(
            playingList,
            "現在、参加中・観戦中の人はいません"
        );
    }

    if (
        finished.length ===
        0
    ) {
        showEmpty(
            finishedList,
            "終了した参加者はいません"
        );
    }

    if (
        cancelled.length ===
        0
    ) {
        showEmpty(
            cancelledList,
            "辞退者はいません"
        );
    }

    renderLobbyDashboard();
}

// ========================================
// 手動参加者追加
// ========================================

if (
    addButton
) {
    addButton.onclick =
        async function () {
            if (
                !currentSessionId
            ) {
                alert(
                    "現在の配信IDがありません。"
                );

                return;
            }

            const name =
                nameInput.value.trim();

            if (
                name ===
                ""
            ) {
                alert(
                    "参加者名を入力してください。"
                );

                return;
            }

            if (
                name.length >
                30
            ) {
                alert(
                    "参加者名は30文字以内にしてください。"
                );

                return;
            }

            addButton.disabled =
                true;

            const nextOrder =
                getNextOrderForGroup(
                    false
                );

            const {
                error
            } =
                await supabaseClient
                    .from(
                        "participants"
                    )
                    .insert([
                        {
                            name:
                                name,

                            status:
                                "waiting",

                            source:
                                "admin",

                            user_id:
                                "admin-" +
                                crypto.randomUUID(),

                            display_order:
                                nextOrder,

                            note:
                                "initial",

                            session_id:
                                currentSessionId,

                            match_count:
                                0,

                            first_participation_pending:
                                true,

                            lobby_state:
                                "waiting",

                            chat_only:
                                false
                        }
                    ]);

            addButton.disabled =
                false;

            if (
                error
            ) {
                console.error(
                    "手動追加エラー:",
                    error
                );

                alert(
                    "参加者を追加できませんでした。"
                );

                return;
            }

            nameInput.value =
                "";

            await loadParticipants();
        };
}

if (
    nameInput
) {
    nameInput.addEventListener(
        "keydown",
        event => {
            if (
                event.key ===
                "Enter"
            ) {
                event.preventDefault();

                if (
                    !addButton.disabled
                ) {
                    addButton.click();
                }
            }
        }
    );
}

// ========================================
// 2試合終了
// ========================================

async function finishTwoGames(
    person
) {
    if (
        !person ||
        !currentSessionId
    ) {
        return;
    }

    const confirmed =
        confirm(
            `${person.name}さんを2試合終了として、再参加待機の最後尾へ移動しますか？`
        );

    if (
        !confirmed
    ) {
        return;
    }

    const {
        data: finishedData,
        error: finishError
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                status:
                    "finished",

                lobby_state:
                    "exchange",

                match_count:
                    2,

                first_participation_pending:
                    false,

                room_id:
                    null
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "status",
                "playing"
            )
            .eq(
                "session_id",
                currentSessionId
            )
            .select(
                "id"
            );

    if (
        finishError
    ) {
        console.error(
            "2試合終了処理エラー:",
            finishError
        );

        alert(
            "2試合終了処理に失敗しました。"
        );

        return;
    }

    if (
        !finishedData ||
        finishedData.length ===
        0
    ) {
        await loadParticipants();

        return;
    }

    await createRejoinEntry(
        person
    );

    await loadParticipants();
}

// ========================================
// 同じグループの最後尾へ
// ========================================

async function moveToGroupEnd(
    person
) {
    if (
        !person ||
        !currentSessionId
    ) {
        return;
    }

    const rejoin =
        isRejoinPerson(
            person
        );

    const nextOrder =
        getNextOrderForGroup(
            rejoin,
            person.id
        );

    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                display_order:
                    nextOrder,

                note:
                    rejoin
                        ? "rejoin"
                        : "initial",

                lobby_state:
                    getMatchCount(
                        person
                    ) >=
                    2
                        ? "exchange"
                        : "waiting"
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "status",
                "waiting"
            );

    if (
        error
    ) {
        console.error(
            "最後尾移動エラー:",
            error
        );

        alert(
            "最後尾へ移動できませんでした。"
        );

        return;
    }

    await loadParticipants();
}

// ========================================
// 状態変更
// ========================================

async function updateStatus(
    id,
    newStatus
) {
    if (
        newStatus ===
        "playing"
    ) {
        await setPlaying(
            participants.find(
                person =>
                    person.id ===
                    id
            )
        );

        return;
    }

    if (
        newStatus ===
        "viewer"
    ) {
        const person =
            participants.find(
                item =>
                    item.id ===
                    id
            );

        if (
            !person
        ) {
            return;
        }

        const {
            error
        } =
            await supabaseClient
                .from(
                    "participants"
                )
                .update({
                    status:
                        "viewer",

                    lobby_state:
                        "watching",

                    room_id:
                        null
                })
                .eq(
                    "id",
                    id
                )
                .eq(
                    "session_id",
                    currentSessionId
                );

        if (
            error
        ) {
            console.error(
                "観戦状態変更エラー:",
                error
            );

            alert(
                "観戦状態に変更できませんでした。"
            );

            return;
        }

        await loadParticipants();

        return;
    }

    const person =
        participants.find(
            item =>
                item.id ===
                id
        );

    const lobbyState =
        newStatus ===
            "waiting"
            ? (
                getMatchCount(
                    person
                ) >=
                2
                    ? "exchange"
                    : "waiting"
            )
            : getLobbyState(
                person
            );

    const ok =
        await setLobbyState(
            id,
            lobbyState,
            newStatus
        );

    if (
        ok
    ) {
        await loadParticipants();
    }
}

// ========================================
// 配信者による辞退処理
// ========================================

async function cancelPerson(
    id,
    name
) {
    const confirmed =
        confirm(
            `${name}さんを辞退扱いにしますか？`
        );

    if (
        !confirmed
    ) {
        return;
    }

    await updateStatus(
        id,
        "cancelled"
    );
}

// ========================================
// 辞退から待機へ戻す
// ========================================

async function restorePerson(
    id
) {
    if (
        !currentSessionId
    ) {
        return;
    }

    const person =
        participants.find(
            item =>
                item.id ===
                id
        );

    if (
        !person
    ) {
        return;
    }

    const rejoin =
        isRejoinPerson(
            person
        );

    const nextOrder =
        getNextOrderForGroup(
            rejoin,
            person.id
        );

    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                status:
                    "waiting",

                lobby_state:
                    getMatchCount(
                        person
                    ) >=
                    2
                        ? "exchange"
                        : "waiting",

                room_id:
                    null,

                display_order:
                    nextOrder,

                note:
                    rejoin
                        ? "rejoin"
                        : "initial"
            })
            .eq(
                "id",
                id
            )
            .eq(
                "session_id",
                currentSessionId
            );

    if (
        error
    ) {
        console.error(
            "復帰エラー:",
            error
        );

        alert(
            "待機列へ戻せませんでした。"
        );

        return;
    }

    await loadParticipants();
}

// ========================================
// 完全削除
// ========================================

async function deletePerson(
    id,
    name
) {
    const confirmed =
        confirm(
            `${name}さんの履歴を完全に削除しますか？`
        );

    if (
        !confirmed
    ) {
        return;
    }

    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .delete()
            .eq(
                "id",
                id
            );

    if (
        error
    ) {
        console.error(
            "削除エラー:",
            error
        );

        alert(
            "削除できませんでした。"
        );

        return;
    }

    await loadParticipants();
}

// ========================================
// 待機列並び替え
// ========================================

async function moveWaiting(
    personId,
    direction
) {
    const waiting =
        participants
            .filter(
                person =>
                    !isChatOnlyPerson(person) &&
                    person.status ===
                    "waiting"
            )
            .sort(
                (
                    a,
                    b
                ) => {
                    const ao =
                        Number(
                            a.display_order
                        );

                    const bo =
                        Number(
                            b.display_order
                        );

                    if (
                        Number.isFinite(
                            ao
                        ) &&
                        Number.isFinite(
                            bo
                        )
                    ) {
                        return (
                            ao -
                            bo
                        );
                    }

                    if (
                        Number.isFinite(
                            ao
                        )
                    ) {
                        return -1;
                    }

                    if (
                        Number.isFinite(
                            bo
                        )
                    ) {
                        return 1;
                    }

                    return String(
                        a.joined_at ||
                        ""
                    ).localeCompare(
                        String(
                            b.joined_at ||
                            ""
                        )
                    );
                }
            );

    const index =
        waiting.findIndex(
            person =>
                person.id ===
                personId
        );

    if (
        index <
        0
    ) {
        return;
    }

    const targetIndex =
        index +
        direction;

    if (
        targetIndex <
            0 ||
        targetIndex >=
            waiting.length
    ) {
        return;
    }

    const first =
        waiting[
            index
        ];

    const second =
        waiting[
            targetIndex
        ];

    const firstOrder =
        Number(
            first.display_order
        );

    const secondOrder =
        Number(
            second.display_order
        );

    const {
        error: firstError
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                display_order:
                    secondOrder
            })
            .eq(
                "id",
                first.id
            );

    if (
        firstError
    ) {
        console.error(
            "並び替えエラー:",
            firstError
        );

        return;
    }

    const {
        error: secondError
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                display_order:
                    firstOrder
            })
            .eq(
                "id",
                second.id
            );

    if (
        secondError
    ) {
        console.error(
            "並び替えエラー:",
            secondError
        );

        return;
    }

    await loadParticipants();
}

// ========================================
// 初期化
// ========================================

async function initialize() {
    disableAdminInput();

    await loadRejoinSetting();

    const loaded =
        await loadCurrentSession();

    if (
        !loaded
    ) {
        render();

        return;
    }

    await loadParticipants();
}

// ========================================
// 自動更新
// ========================================

setInterval(
    async () => {
        const previousSession =
            currentSessionId;

        await loadCurrentSession();

        if (
            currentSessionId !==
            previousSession
        ) {
            resetUrlParticipantNotification();

            console.log(
                "配信IDが変更されました:",
                currentSessionId
            );
        }

        await loadParticipants();
    },
    3000
);

// ========================================
// 起動
// ========================================

initialize();

// ========================================
// 参加中の全員を2試合終了
// ========================================

async function finishAllPlaying() {
    if (
        !currentSessionId ||
        !finishAllPlayingButton
    ) {
        return;
    }

    const playingMembers =
        participants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                getLobbyState(
                    person
                ) ===
                "playing"
        );

    if (
        playingMembers.length ===
        0
    ) {
        alert(
            "現在参加中のメンバーはいません。"
        );

        return;
    }

    const confirmed =
        confirm(
            `現在参加中の${playingMembers.length}人を、全員2試合終了として再参加待機の最後尾へ移動しますか？`
        );

    if (
        !confirmed
    ) {
        return;
    }

    finishAllPlayingButton.disabled =
        true;

    finishAllPlayingButton.textContent =
        "処理中…";

    let successCount =
        0;

    const failedNames =
        [];

    for (
        const person
        of playingMembers
    ) {
        try {
            const {
                data: finishedData,
                error: finishError
            } =
                await supabaseClient
                    .from(
                        "participants"
                    )
                    .update({
                        status:
                            "finished",

                        lobby_state:
                            "exchange",

                        match_count:
                            2,

                        first_participation_pending:
                            false,

                        room_id:
                            null
                    })
                    .eq(
                        "id",
                        person.id
                    )
                    .eq(
                        "status",
                        "playing"
                    )
                    .eq(
                        "session_id",
                        currentSessionId
                    )
                    .select(
                        "id"
                    );

            if (
                finishError
            ) {
                throw finishError;
            }

            if (
                !finishedData ||
                finishedData.length ===
                0
            ) {
                throw new Error(
                    "参加状態を更新できませんでした。"
                );
            }

            if (
                !(
                    await createRejoinEntry(
                        person
                    )
                )
            ) {
                throw new Error(
                    "再参加待機への追加に失敗しました。"
                );
            }

            successCount +=
                1;

        } catch (
            error
        ) {
            console.error(
                "全員2試合終了エラー:",
                person.name,
                error
            );

            failedNames.push(
                person.name
            );
        }
    }

    await loadParticipants();

    finishAllPlayingButton.disabled =
        false;

    finishAllPlayingButton.textContent =
        "🔁 参加中の全員を2試合終了";

    if (
        failedNames.length ===
        0
    ) {
        alert(
            `${successCount}人を再参加待機の最後尾へ移動しました。`
        );

        return;
    }

    alert(
        `${successCount}人の移動が完了しました。\n\n処理できなかった参加者：\n${failedNames.join("、")}`
    );
}

// ========================================
// 参加中全員の試合数を1試合進める
// ※観戦中は対象外
// ========================================

async function finishOneMatchForAll() {
    if (
        !currentSessionId
    ) {
        return;
    }

    const playingMembers =
        participants.filter(
            person =>
                !isChatOnlyPerson(person) &&
                getLobbyState(
                    person
                ) ===
                "playing"
        );

    if (
        playingMembers.length ===
        0
    ) {
        alert(
            "現在、試合数を進める参加中メンバーはいません。"
        );

        return;
    }

    const confirmed =
        confirm(
            `現在参加中の${playingMembers.length}人の試合数を全員＋1します。\n観戦中の人は対象外です。\n\n実行しますか？`
        );

    if (
        !confirmed
    ) {
        return;
    }

    let successCount =
        0;

    const failedNames =
        [];

    for (
        const person
        of playingMembers
    ) {
        try {
            const currentCount =
                getMatchCount(
                    person
                );

            const nextCount =
                Math.min(
                    2,
                    currentCount +
                    1
                );

            if (
                nextCount <=
                currentCount
            ) {
                continue;
            }

            if (
                nextCount >=
                2
            ) {
                const {
                    data: finishedData,
                    error: finishError
                } =
                    await supabaseClient
                        .from(
                            "participants"
                        )
                        .update({
                            status:
                                "finished",

                            lobby_state:
                                "exchange",

                            match_count:
                                2,

                            first_participation_pending:
                                false,

                            room_id:
                                null
                        })
                        .eq(
                            "id",
                            person.id
                        )
                        .eq(
                            "status",
                            "playing"
                        )
                        .eq(
                            "session_id",
                            currentSessionId
                        )
                        .select(
                            "id"
                        );

                if (
                    finishError
                ) {
                    throw finishError;
                }

                if (
                    !finishedData ||
                    finishedData.length ===
                    0
                ) {
                    throw new Error(
                        "参加状態を更新できませんでした。"
                    );
                }

                if (
                    !(
                        await createRejoinEntry(
                            person
                        )
                    )
                ) {
                    throw new Error(
                        "再参加待機への追加に失敗しました。"
                    );
                }

            } else {
                const {
                    error
                } =
                    await supabaseClient
                        .from(
                            "participants"
                        )
                        .update({
                            match_count:
                                nextCount,

                            first_participation_pending:
                                false,

                            lobby_state:
                                "playing",

                            status:
                                "playing"
                        })
                        .eq(
                            "id",
                            person.id
                        )
                        .eq(
                            "status",
                            "playing"
                        )
                        .eq(
                            "session_id",
                            currentSessionId
                        );

                if (
                    error
                ) {
                    throw error;
                }
            }

            successCount +=
                1;

        } catch (
            error
        ) {
            console.error(
                "全員試合数＋1エラー:",
                person.name,
                error
            );

            failedNames.push(
                person.name
            );
        }
    }

    await loadParticipants();

    if (
        failedNames.length ===
        0
    ) {
        alert(
            `${successCount}人の試合数を＋1しました。`
        );

        return;
    }

    alert(
        `${successCount}人の処理が完了しました。\n\n処理できなかった参加者：\n${failedNames.join("、")}`
    );
}

// ========================================
// 一括試合終了＋1ボタン
// ========================================

function ensureBulkFinishOneMatchButton() {
    if (
        document.getElementById(
            "bulkFinishOneMatchButton"
        )
    ) {
        return;
    }

    if (
        !finishAllPlayingButton ||
        !finishAllPlayingButton.parentElement
    ) {
        return;
    }

    const button =
        createButton(
            "🎮 今の試合終了（参加中全員＋1）",
            "finish",
            finishOneMatchForAll
        );

    button.id =
        "bulkFinishOneMatchButton";

    finishAllPlayingButton.parentElement.insertBefore(
        button,
        finishAllPlayingButton.nextSibling
    );
}

ensureBulkFinishOneMatchButton();

// ========================================
// 参加中全員2試合終了ボタン
// ========================================

if (
    finishAllPlayingButton
) {
    finishAllPlayingButton.addEventListener(
        "click",
        finishAllPlaying
    );
}

// ========================================
// 以上
// ========================================