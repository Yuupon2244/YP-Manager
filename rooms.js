// ========================================
// YP-Manager 部屋管理 v0.9.2
// ========================================


// ========================================
// HTML要素
// ========================================

const roomNameInput =
    document.getElementById(
        "roomNameInput"
    );

const moderatorNameInput =
    document.getElementById(
        "moderatorNameInput"
    );

const createRoomButton =
    document.getElementById(
        "createRoomButton"
    );

const roomList =
    document.getElementById(
        "roomList"
    );


// ========================================
// データ
// ========================================

let rooms = [];

let lastRoomSessionId =
    null;

let lastRoomMemberSignature =
    "";


// ========================================
// 部屋一覧取得
// ========================================

async function loadRooms() {

    if (!roomList) {
        return;
    }


    if (!currentSessionId) {

        rooms = [];

        renderRooms();

        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from("rooms")
            .select("*")
            .eq(
                "session_id",
                currentSessionId
            )
            .eq(
                "is_active",
                true
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "部屋読み込みエラー:",
            error
        );


        roomList.innerHTML =
            "";


        showRoomMessage(
            "部屋情報を取得できませんでした"
        );


        return;
    }


    rooms =
        data || [];


    lastRoomSessionId =
        currentSessionId;


    renderRooms();

    decorateWaitingCards();

    updateRoomMemberSignature();
}


// ========================================
// メッセージ表示
// ========================================

function showRoomMessage(
    text
) {

    if (!roomList) {
        return;
    }


    const box =
        document.createElement(
            "div"
        );


    box.className =
        "person";


    box.textContent =
        text;


    roomList.appendChild(
        box
    );
}


// ========================================
// 部屋所属者取得
// ========================================

function getRoomMembers(
    roomId
) {

    if (
        typeof participants ===
        "undefined"
    ) {

        return [];
    }


    return participants.filter(
        person =>
            person.room_id ===
            roomId
    );
}


// ========================================
// 部屋取得
// ========================================

function getRoomById(
    roomId
) {

    return (
        rooms.find(
            room =>
                room.id ===
                roomId
        ) ||
        null
    );
}


// ========================================
// 部屋所属状態の署名
// ========================================

function createRoomMemberSignature() {

    if (
        typeof participants ===
        "undefined"
    ) {

        return "";
    }


    return JSON.stringify(
        participants
            .map(
                person => ({
                    id:
                        person.id,

                    room_id:
                        person.room_id,

                    status:
                        person.status
                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    String(
                        a.id
                    ).localeCompare(
                        String(
                            b.id
                        )
                    )
            )
    );
}


function updateRoomMemberSignature() {

    lastRoomMemberSignature =
        createRoomMemberSignature();
}


// ========================================
// 部屋一覧表示
// ========================================

function renderRooms() {

    if (!roomList) {
        return;
    }


    roomList.innerHTML =
        "";


    if (
        rooms.length === 0
    ) {

        showRoomMessage(
            "現在、待機部屋はありません"
        );

        return;
    }


    rooms.forEach(
        room => {

            const members =
                getRoomMembers(
                    room.id
                );


            const roomBox =
                document.createElement(
                    "div"
                );


            roomBox.className =
                "person";


            // =================================
            // 部屋名
            // =================================

            const titleBox =
                document.createElement(
                    "div"
                );


            titleBox.className =
                "name";


            titleBox.textContent =
                `🏠 ${room.name}`;


            roomBox.appendChild(
                titleBox
            );


            // =================================
            // 管理者
            // =================================

            const moderatorBox =
                document.createElement(
                    "div"
                );


            moderatorBox.className =
                "date";


            moderatorBox.textContent =
                room.moderator_name
                    ? `管理者：${room.moderator_name}`
                    : "管理者：未設定";


            roomBox.appendChild(
                moderatorBox
            );


            // =================================
            // 人数
            // =================================

            const countBox =
                document.createElement(
                    "div"
                );


            countBox.className =
                "date";


            countBox.textContent =
                `参加者：${members.length} / ${room.capacity}人`;


            roomBox.appendChild(
                countBox
            );


            // =================================
            // 空き人数
            // =================================

            const freeCount =
                Math.max(
                    0,
                    Number(
                        room.capacity
                    ) -
                    members.length
                );


            const freeBox =
                document.createElement(
                    "div"
                );


            freeBox.className =
                "date";


            freeBox.textContent =
                freeCount === 0
                    ? "現在：満員"
                    : `空き：${freeCount}人`;


            roomBox.appendChild(
                freeBox
            );


            // =================================
            // 部屋メンバー
            // =================================

            const memberArea =
                document.createElement(
                    "div"
                );


            memberArea.style.marginTop =
                "12px";


            if (
                members.length === 0
            ) {

                const empty =
                    document.createElement(
                        "div"
                    );


                empty.className =
                    "date";


                empty.textContent =
                    "現在、この部屋にいる人はいません";


                memberArea.appendChild(
                    empty
                );

            } else {

                const memberTitle =
                    document.createElement(
                        "div"
                    );


                memberTitle.style.fontWeight =
                    "bold";


                memberTitle.style.marginBottom =
                    "7px";


                memberTitle.textContent =
                    "👥 現在のメンバー";


                memberArea.appendChild(
                    memberTitle
                );


                members.forEach(
                    person => {

                        const row =
                            document.createElement(
                                "div"
                            );


                        row.style.display =
                            "flex";


                        row.style.alignItems =
                            "center";


                        row.style.justifyContent =
                            "space-between";


                        row.style.gap =
                            "8px";


                        row.style.padding =
                            "7px 0";


                        row.style.borderTop =
                            "1px solid rgba(255,255,255,0.08)";


                        const info =
                            document.createElement(
                                "span"
                            );


                        info.textContent =
                            person.name;


                        const returnButton =
                            document.createElement(
                                "button"
                            );


                        returnButton.type =
                            "button";


                        returnButton.textContent =
                            "↩ メインへ戻す";


                        returnButton.className =
                            "move";


                        returnButton.onclick =
                            () =>
                                removePersonFromRoom(
                                    person,
                                    room
                                );


                        row.appendChild(
                            info
                        );


                        row.appendChild(
                            returnButton
                        );


                        memberArea.appendChild(
                            row
                        );
                    }
                );
            }


            roomBox.appendChild(
                memberArea
            );


            // =================================
            // 部屋操作ボタン
            // =================================

            const buttonsBox =
                document.createElement(
                    "div"
                );


            buttonsBox.className =
                "buttons";


            // ---------------------------------
            // 管理
            // ---------------------------------

            const detailButton =
                document.createElement(
                    "button"
                );


            detailButton.type =
                "button";


            detailButton.textContent =
                "管理";


            detailButton.className =
                "call";


            detailButton.onclick =
                () =>
                    showRoomDetail(
                        room
                    );


            // ---------------------------------
            // 管理URL
            // ---------------------------------

            const adminUrlButton =
                document.createElement(
                    "button"
                );


            adminUrlButton.type =
                "button";


            adminUrlButton.textContent =
                "🔗 管理URL";


            adminUrlButton.className =
                "move";


            adminUrlButton.onclick =
                () =>
                    openRoomAdminUrl(
                        room
                    );


            // ---------------------------------
            // 部屋を閉じる
            // ---------------------------------

            const closeButton =
                document.createElement(
                    "button"
                );


            closeButton.type =
                "button";


            closeButton.textContent =
                "部屋を閉じる";


            closeButton.className =
                "delete";


            closeButton.onclick =
                () =>
                    closeRoom(
                        room
                    );


            buttonsBox.appendChild(
                detailButton
            );


            buttonsBox.appendChild(
                adminUrlButton
            );


            buttonsBox.appendChild(
                closeButton
            );


            roomBox.appendChild(
                buttonsBox
            );


            roomList.appendChild(
                roomBox
            );
        }
    );
}


// ========================================
// 待機者カードへ部屋操作を追加
// ========================================

function decorateWaitingCards() {

    const waitingElement =
        document.getElementById(
            "waitingList"
        );


    if (
        !waitingElement ||
        typeof participants ===
        "undefined"
    ) {

        return;
    }


    const waiting =
        participants.filter(
            person =>
                person.status ===
                "waiting"
        );


    const cards =
        Array.from(
            waitingElement.children
        );


    if (
        waiting.length === 0
    ) {

        return;
    }


    waiting.forEach(
        (
            person,
            index
        ) => {

            const card =
                cards[index];


            if (!card) {
                return;
            }


            const buttonsBox =
                card.querySelector(
                    ".buttons"
                );


            const nameBox =
                card.querySelector(
                    ".name"
                );


            if (!buttonsBox) {
                return;
            }


            // =================================
            // 現在地表示
            // =================================

            const oldLocation =
                card.querySelector(
                    ".room-location"
                );


            if (oldLocation) {

                oldLocation.remove();
            }


            if (
                person.room_id
            ) {

                const room =
                    getRoomById(
                        person.room_id
                    );


                const locationBox =
                    document.createElement(
                        "div"
                    );


                locationBox.className =
                    "date room-location";


                locationBox.style.marginTop =
                    "3px";


                locationBox.style.color =
                    "#7fd7ff";


                locationBox.textContent =
                    room
                        ? `🏠 現在地：${room.name}`
                        : "🏠 現在地：待機部屋";


                if (
                    nameBox &&
                    nameBox.nextSibling
                ) {

                    card.insertBefore(
                        locationBox,
                        nameBox.nextSibling
                    );

                } else {

                    card.insertBefore(
                        locationBox,
                        buttonsBox
                    );
                }
            }


            // =================================
            // すでにボタンがある場合
            // =================================

            const existingButton =
                buttonsBox.querySelector(
                    ".room-move-button"
                );


            if (existingButton) {

                existingButton.textContent =
                    person.room_id
                        ? "🏠 部屋変更"
                        : "🏠 部屋へ";


                existingButton.onclick =
                    () =>
                        chooseRoomForPerson(
                            person
                        );


                return;
            }


            // =================================
            // 部屋へボタン
            // =================================

            const roomButton =
                document.createElement(
                    "button"
                );


            roomButton.type =
                "button";


            roomButton.className =
                "move room-move-button";


            roomButton.textContent =
                person.room_id
                    ? "🏠 部屋変更"
                    : "🏠 部屋へ";


            roomButton.onclick =
                () =>
                    chooseRoomForPerson(
                        person
                    );


            const lastButton =
                Array.from(
                    buttonsBox.children
                ).find(
                    button =>
                        button.textContent.includes(
                            "最後尾"
                        )
                );


            if (lastButton) {

                buttonsBox.insertBefore(
                    roomButton,
                    lastButton
                );

            } else {

                buttonsBox.appendChild(
                    roomButton
                );
            }
        }
    );
}


// ========================================
// 部屋選択
// ========================================

async function chooseRoomForPerson(
    person
) {

    if (!person) {
        return;
    }


    if (
        rooms.length === 0
    ) {

        alert(
            "現在、移動できる待機部屋がありません。"
        );

        return;
    }


    let text =
        `${person.name}さんを移動する部屋を選んでください。\n\n`;


    rooms.forEach(
        (
            room,
            index
        ) => {

            const members =
                getRoomMembers(
                    room.id
                );


            const currentMark =
                person.room_id ===
                room.id
                    ? " ← 現在地"
                    : "";


            text +=
                `${index + 1}. ${room.name}` +
                ` (${members.length}/${room.capacity})` +
                `${currentMark}\n`;
        }
    );


    text +=
        "\n0. メイン待機へ戻す";


    const answer =
        prompt(
            text
        );


    if (
        answer === null
    ) {

        return;
    }


    const number =
        Number(
            answer
        );


    if (
        !Number.isInteger(
            number
        )
    ) {

        alert(
            "番号で入力してください。"
        );

        return;
    }


    // =====================================
    // メインへ戻す
    // =====================================

    if (
        number === 0
    ) {

        await removePersonFromRoom(
            person
        );

        return;
    }


    if (
        number < 1 ||
        number > rooms.length
    ) {

        alert(
            "正しい部屋番号を入力してください。"
        );

        return;
    }


    const selectedRoom =
        rooms[
            number - 1
        ];


    await assignPersonToRoom(
        person,
        selectedRoom
    );
}


// ========================================
// 待機部屋へ所属
// ========================================

async function assignPersonToRoom(
    person,
    room
) {

    if (
        !person ||
        !room
    ) {

        return;
    }


    if (
        person.room_id ===
        room.id
    ) {

        alert(
            `${person.name}さんはすでに${room.name}にいます。`
        );

        return;
    }


    const members =
        getRoomMembers(
            room.id
        );


    if (
        members.length >=
        Number(
            room.capacity
        )
    ) {

        alert(
            `${room.name}は満員です。`
        );

        return;
    }


    const confirmed =
        confirm(
            `${person.name}さんを\n${room.name}\nへ移動しますか？\n\nメイン待機順位は維持されます。`
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
            .update({
                room_id:
                    room.id
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
            "部屋移動エラー:",
            error
        );


        alert(
            "待機部屋へ移動できませんでした。"
        );


        return;
    }


    await refreshRoomSystem();
}


// ========================================
// メイン待機へ戻す
// ========================================

async function removePersonFromRoom(
    person,
    room = null
) {

    if (!person) {
        return;
    }


    if (
        !person.room_id
    ) {

        return;
    }


    if (room) {

        const confirmed =
            confirm(
                `${person.name}さんを${room.name}からメイン待機へ戻しますか？`
            );


        if (!confirmed) {
            return;
        }
    }


    const {
        error
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                room_id:
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


    if (error) {

        console.error(
            "メイン復帰エラー:",
            error
        );


        alert(
            "メイン待機へ戻せませんでした。"
        );


        return;
    }


    await refreshRoomSystem();
}


// ========================================
// 待機部屋作成
// ========================================

async function createRoom() {

    if (!currentSessionId) {

        alert(
            "現在の配信IDがありません。"
        );

        return;
    }


    const roomNameValue =
        roomNameInput
            ? roomNameInput
                .value
                .trim()
            : "";


    const moderatorNameValue =
        moderatorNameInput
            ? moderatorNameInput
                .value
                .trim()
            : "";


    if (
        roomNameValue === ""
    ) {

        alert(
            "部屋名を入力してください。"
        );

        return;
    }


    if (
        roomNameValue.length > 30
    ) {

        alert(
            "部屋名は30文字以内にしてください。"
        );

        return;
    }


    if (
        moderatorNameValue.length > 30
    ) {

        alert(
            "管理者名は30文字以内にしてください。"
        );

        return;
    }


    const duplicate =
        rooms.some(
            room =>
                String(
                    room.name
                ).trim() ===
                roomNameValue
        );


    if (duplicate) {

        alert(
            "同じ名前の待機部屋がすでにあります。"
        );

        return;
    }


    createRoomButton.disabled =
        true;


    createRoomButton.textContent =
        "作成中…";


    const {
        error
    } =
        await supabaseClient
            .from(
                "rooms"
            )
            .insert([
                {
                    session_id:
                        currentSessionId,

                    name:
                        roomNameValue,

                    room_type:
                        "waiting",

                    moderator_name:
                        moderatorNameValue ||
                        null,

                    capacity:
                        9,

                    is_active:
                        true
                }
            ]);


    createRoomButton.disabled =
        false;


    createRoomButton.textContent =
        "＋ 待機部屋を作成";


    if (error) {

        console.error(
            "部屋作成エラー:",
            error
        );


        alert(
            "待機部屋を作成できませんでした。"
        );


        return;
    }


    roomNameInput.value =
        "";


    moderatorNameInput.value =
        "";


    await loadRooms();
}


// ========================================
// 部屋を閉じる
// ========================================

async function closeRoom(
    room
) {

    if (!room) {
        return;
    }


    const members =
        getRoomMembers(
            room.id
        );


    let text =
        `${room.name}を閉じますか？`;


    if (
        members.length > 0
    ) {

        text +=
            `\n\n現在${members.length}人がいます。`;


        text +=
            "\n全員メイン待機へ戻してから部屋を閉じます。";
    }


    const confirmed =
        confirm(
            text
        );


    if (!confirmed) {
        return;
    }


    // =====================================
    // 全員room_id解除
    // =====================================

    const {
        error: memberError
    } =
        await supabaseClient
            .from(
                "participants"
            )
            .update({
                room_id:
                    null
            })
            .eq(
                "room_id",
                room.id
            );


    if (memberError) {

        console.error(
            "部屋所属解除エラー:",
            memberError
        );


        alert(
            "参加者の部屋所属を解除できませんでした。"
        );


        return;
    }


    // =====================================
    // 部屋非アクティブ
    // =====================================

    const {
        error
    } =
        await supabaseClient
            .from(
                "rooms"
            )
            .update({
                is_active:
                    false
            })
            .eq(
                "id",
                room.id
            );


    if (error) {

        console.error(
            "部屋終了エラー:",
            error
        );


        alert(
            "部屋を閉じられませんでした。"
        );


        return;
    }


    await refreshRoomSystem();
}


// ========================================
// モデレーター管理画面URL
// ========================================

function createRoomAdminUrl(
    room
) {

    if (
        !room ||
        !room.id
    ) {

        return null;
    }


    const adminUrl =
        new URL(
            "room-admin.html",
            window.location.href
        );


    adminUrl.searchParams.set(
        "room",
        room.id
    );


    return adminUrl;
}


function openRoomAdminUrl(
    room
) {

    const adminUrl =
        createRoomAdminUrl(
            room
        );


    if (!adminUrl) {

        alert(
            "部屋IDを取得できませんでした。"
        );

        return;
    }


    const confirmed =
        confirm(
            `${room.name}の管理画面を開きます。\n\n` +
            `この部屋専用の管理URLです。\n\n` +
            `開きますか？`
        );


    if (!confirmed) {
        return;
    }


    window.open(
        adminUrl.href,
        "_blank"
    );
}


// ========================================
// 部屋詳細
// ========================================

function showRoomDetail(
    room
) {

    if (!room) {
        return;
    }


    const members =
        getRoomMembers(
            room.id
        );


    const memberText =
        members.length === 0
            ? "現在の参加者はいません"
            : members
                .map(
                    person =>
                        `・${person.name}`
                )
                .join(
                    "\n"
                );


    alert(
        `${room.name}\n\n` +
        `管理者：${
            room.moderator_name ||
            "未設定"
        }\n` +
        `定員：${room.capacity}人\n` +
        `現在：${members.length}人\n\n` +
        memberText
    );
}


// ========================================
// 全体再取得
// ========================================

async function refreshRoomSystem() {

    if (
        typeof loadParticipants ===
        "function"
    ) {

        await loadParticipants();
    }


    await loadRooms();
}


// ========================================
// イベント
// ========================================

if (
    createRoomButton
) {

    createRoomButton.addEventListener(
        "click",
        createRoom
    );
}


if (
    roomNameInput
) {

    roomNameInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                    "Enter" &&
                createRoomButton &&
                !createRoomButton.disabled
            ) {

                event.preventDefault();


                createRoomButton.click();
            }
        }
    );
}


if (
    moderatorNameInput
) {

    moderatorNameInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                    "Enter" &&
                createRoomButton &&
                !createRoomButton.disabled
            ) {

                event.preventDefault();


                createRoomButton.click();
            }
        }
    );
}


// ========================================
// 部屋情報の自動更新
// ========================================

async function roomAutoRefresh() {

    if (!currentSessionId) {
        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from(
                "rooms"
            )
            .select("*")
            .eq(
                "session_id",
                currentSessionId
            )
            .eq(
                "is_active",
                true
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "部屋自動更新エラー:",
            error
        );

        return;
    }


    const newRooms =
        data || [];


    // =====================================
    // 部屋自体の変更確認
    // =====================================

    const oldRoomSignature =
        JSON.stringify(
            rooms.map(
                room => ({
                    id:
                        room.id,

                    name:
                        room.name,

                    moderator_name:
                        room.moderator_name,

                    capacity:
                        room.capacity,

                    is_active:
                        room.is_active
                })
            )
        );


    const newRoomSignature =
        JSON.stringify(
            newRooms.map(
                room => ({
                    id:
                        room.id,

                    name:
                        room.name,

                    moderator_name:
                        room.moderator_name,

                    capacity:
                        room.capacity,

                    is_active:
                        room.is_active
                })
            )
        );


    rooms =
        newRooms;


    // =====================================
    // 部屋所属人数の変更確認
    // =====================================

    const newMemberSignature =
        createRoomMemberSignature();


    const roomChanged =
        oldRoomSignature !==
        newRoomSignature;


    const memberChanged =
        newMemberSignature !==
        lastRoomMemberSignature;


    if (
        roomChanged ||
        memberChanged
    ) {

        renderRooms();


        lastRoomMemberSignature =
            newMemberSignature;
    }


    scheduleWaitingDecoration();
}


// ========================================
// 待機列DOMの変更監視
// ========================================

const waitingListObserverTarget =
    document.getElementById(
        "waitingList"
    );


let waitingDecorateScheduled =
    false;


function scheduleWaitingDecoration() {

    if (
        waitingDecorateScheduled
    ) {

        return;
    }


    waitingDecorateScheduled =
        true;


    requestAnimationFrame(
        () => {

            waitingDecorateScheduled =
                false;


            decorateWaitingCards();
        }
    );
}


if (
    waitingListObserverTarget
) {

    const waitingListObserver =
        new MutationObserver(
            mutations => {

                let needsUpdate =
                    false;


                for (
                    const mutation
                    of mutations
                ) {

                    if (
                        mutation.type ===
                            "childList" &&
                        mutation.target ===
                            waitingListObserverTarget
                    ) {

                        needsUpdate =
                            true;

                        break;
                    }
                }


                if (
                    needsUpdate
                ) {

                    scheduleWaitingDecoration();
                }
            }
        );


    waitingListObserver.observe(
        waitingListObserverTarget,
        {
            childList: true
        }
    );
}


// ========================================
// 起動
// ========================================

setTimeout(
    async () => {

        await loadRooms();

    },
    600
);


// 初回の待機カード装飾
setTimeout(
    () => {

        scheduleWaitingDecoration();

    },
    800
);


// 3秒ごとに確認
setInterval(
    roomAutoRefresh,
    3000
);