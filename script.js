// ========================================
// YP-Manager 管理画面 v0.8.0
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

let urlNotificationInitialized = false;
let knownUrlParticipantIds = new Set();
let notificationHideTimer = null;
let notificationAudioContext = null;


function unlockNotificationAudio() {

    try {

        if (!notificationAudioContext) {

            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;


            if (AudioContextClass) {

                notificationAudioContext =
                    new AudioContextClass();
            }
        }


        if (
            notificationAudioContext?.state ===
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
        once:true
    }
);


function playDefaultNotificationSound() {

    unlockNotificationAudio();


    if (!notificationAudioContext) {

        return;
    }


    const now =
        notificationAudioContext.currentTime;

    const gain =
        notificationAudioContext.createGain();


    gain.gain.setValueAtTime(
        0.0001,
        now
    );

    gain.gain.exponentialRampToValueAtTime(
        0.22,
        now + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.55
    );

    gain.connect(
        notificationAudioContext.destination
    );


    [
        {
            frequency:880,
            start:0,
            duration:0.18
        },
        {
            frequency:1320,
            start:0.16,
            duration:0.32
        }
    ].forEach(
        tone => {

            const oscillator =
                notificationAudioContext.createOscillator();


            oscillator.type =
                "sine";

            oscillator.frequency.setValueAtTime(
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
                now + tone.start + tone.duration
            );
        }
    );
}


async function playUrlJoinSound() {

    if (!URL_JOIN_SOUND_FILE) {

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

    if (!urlJoinNotification) {

        return;
    }


    urlJoinNotification.textContent =
        `🔔 URL参加：${name}`;

    urlJoinNotification.classList.add(
        "show"
    );


    clearTimeout(
        notificationHideTimer
    );


    notificationHideTimer =
        setTimeout(
            () => {

                urlJoinNotification.classList.remove(
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
                person.source === "url" &&
                person.status === "waiting"
        );


    const currentIds =
        new Set(
            currentUrlParticipants.map(
                person =>
                    person.id
            )
        );


    if (!urlNotificationInitialized) {

        knownUrlParticipantIds =
            currentIds;

        urlNotificationInitialized =
            true;

        return;
    }


    const newParticipants =
        currentUrlParticipants.filter(
            person =>
                !knownUrlParticipantIds.has(
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

const INITIAL_ORDER_BASE = 1;
const REJOIN_ORDER_BASE = 1000000;


// ========================================
// 日時表示
// ========================================

function formatDate(dateValue) {

    if (!dateValue) {
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


    if (error) {

        console.error(
            "再参加設定取得エラー:",
            error
        );

        return;
    }


    if (!data) {

        const {
            error:insertError
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


        if (insertError) {

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
            ) === "true";
    }


    renderRejoinToggle();
}


// ========================================
// 再参加ボタン表示
// ========================================

function renderRejoinToggle() {

    if (rejoinEnabled) {

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


    if (error) {

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


    if (error) {

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
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .select("*")
            .eq(
                "session_id",
                currentSessionId
            )
            .order(
                "display_order",
                {
                    ascending:true,
                    nullsFirst:false
                }
            )
            .order(
                "joined_at",
                {
                    ascending:true
                }
            );


    if (error) {

        console.error(
            "参加者読み込みエラー:",
            error
        );

        return;
    }

    const nextParticipants =
        data || [];


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
        person.note === "rejoin" ||
        (
            person.note !== "initial" &&
            Number.isFinite(
                Number(
                    person.display_order
                )
            ) &&
            Number(
                person.display_order
            ) >= 1000000
        );


    const isInitial =
        person.note === "initial" ||
        (
            person.note !== "rejoin" &&
            Number.isFinite(
                Number(
                    person.display_order
                )
            ) &&
            Number(
                person.display_order
            ) < 1000000
        );


    if (isRejoin) {

        typeBadge.textContent =
            "🔁 再参加";

        typeBadge.style.background =
            "#7b5bd6";

    } else if (isInitial) {

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
    "date";


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
// 初参加 / 再参加判定
// ========================================

function isRejoinPerson(person) {

    return (
        person.note === "rejoin" ||
        (
            person.note !== "initial" &&
            Number.isFinite(
                Number(
                    person.display_order
                )
            ) &&
            Number(
                person.display_order
            ) >= REJOIN_ORDER_BASE
        )
    );
}


function isInitialPerson(person) {

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
            person.game_name || ""
        );


    if (input === null) {

        return;
    }


    const gameName =
        input.trim();


    if (gameName.length > 30) {

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
                    gameName || null
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "session_id",
                currentSessionId
            );


    if (error) {

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
// グループ最後尾の順番を取得
// ========================================

function getNextOrderForGroup(
    isRejoin,
    excludeId = null
) {

    const orders =
        participants
            .filter(
                person =>
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


    if (isRejoin) {

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
// 画面表示
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
        participants.filter(
            person =>
                person.status ===
                "waiting"
        );


    const playing =
        participants.filter(
            person =>
                person.status ===
                "playing"
        );


    const finished =
        participants.filter(
            person =>
                person.status ===
                "finished"
        );


    const cancelled =
        participants.filter(
            person =>
                person.status ===
                "cancelled"
        );


    // =====================================
    // 待機中
    // =====================================

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
                    "▶ 呼び出し",
                    "call",
                    () =>
                        updateStatus(
                            person.id,
                            "playing"
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


    // =====================================
    // 参加中
    // =====================================

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
                    "🔁 2試合終了",
                    "finish",
                    () =>
                        finishTwoGames(
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


    // =====================================
    // 終了
    // =====================================

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


    // =====================================
    // 辞退
    // =====================================

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
        waiting.length === 0
    ) {

        showEmpty(
            waitingList,
            "現在、待機者はいません"
        );
    }


    if (
        playing.length === 0
    ) {

        showEmpty(
            playingList,
            "現在、参加中の人はいません"
        );
    }


    if (
        finished.length === 0
    ) {

        showEmpty(
            finishedList,
            "終了した参加者はいません"
        );
    }


    if (
        cancelled.length === 0
    ) {

        showEmpty(
            cancelledList,
            "辞退者はいません"
        );
    }
}


// ========================================
// 手動参加者追加
// ========================================

addButton.onclick =
    async function () {

        if (!currentSessionId) {

            alert(
                "現在の配信IDがありません。"
            );

            return;
        }


        const name =
            nameInput.value.trim();


        if (name === "") {

            alert(
                "参加者名を入力してください。"
            );

            return;
        }


        if (
            name.length > 30
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
                            currentSessionId
                    }
                ]);


        addButton.disabled =
            false;


        if (error) {

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


    if (!confirmed) {

        return;
    }


    const nextOrder =
        getNextOrderForGroup(
            true
        );


    const {
        data:finishedData,
        error:finishError
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                status:
                    "finished"
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "status",
                "playing"
            )
            .select(
                "id"
            );


    if (finishError) {

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


    const {
        error:insertError
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

                    display_order:
                        nextOrder,

                    note:
                        "rejoin",

                    session_id:
                        currentSessionId
                }
            ]);


    if (insertError) {

        console.error(
            "再参加待機追加エラー:",
            insertError
        );

        alert(
            "終了記録は保存されましたが、再参加待機への追加に失敗しました。"
        );

        await loadParticipants();

        return;
    }


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
                        : "initial"
            })
            .eq(
                "id",
                person.id
            )
            .eq(
                "status",
                "waiting"
            );


    if (error) {

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

    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                status:
                    newStatus
            })
            .eq(
                "id",
                id
            );


    if (error) {

        console.error(
            "状態変更エラー:",
            error
        );

        alert(
            "状態を変更できませんでした。"
        );

        return;
    }


    await loadParticipants();
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


    if (!confirmed) {

        return;
    }


    await updateStatus(
        id,
        "cancelled"
    );
}


// ========================================
// 辞退 → 待機へ戻す
// ========================================

async function restorePerson(
    id
) {

    if (!currentSessionId) {
        return;
    }


    const person =
        participants.find(
            item =>
                item.id ===
                id
        );


    if (!person) {

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
            );


    if (error) {

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


    if (!confirmed) {

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


    if (error) {

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
                    person.status ===
                    "waiting"
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    Number(
                        a.display_order
                    ) -
                    Number(
                        b.display_order
                    )
            );


    const index =
        waiting.findIndex(
            person =>
                person.id ===
                personId
        );


    if (index === -1) {
        return;
    }


    const targetIndex =
        index +
        direction;


    if (
        targetIndex < 0 ||
        targetIndex >=
            waiting.length
    ) {

        return;
    }


    const first =
        waiting[index];

    const second =
        waiting[targetIndex];


    const firstOrder =
        Number(
            first.display_order
        );

    const secondOrder =
        Number(
            second.display_order
        );


    const {
        error:firstError
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


    if (firstError) {

        console.error(
            "並び替えエラー:",
            firstError
        );

        return;
    }


    const {
        error:secondError
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


    if (secondError) {

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

    if (!loaded) {

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