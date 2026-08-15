// ========================================
// YP-Manager 待機部屋管理 v1.2.0
// Anonymous Moderator + Invite Code
// ========================================


// ========================================
// Supabase
// ========================================

const SUPABASE_URL =
    "https://ilmiebokwfccybrtduxy.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_tl-vkXmtiYn_f1VtPy689A_dwKCdYg5";


const roomAdminSupabase =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


// ========================================
// HTML要素
// ========================================

const connectionStatus =
    document.getElementById(
        "connectionStatus"
    );

const authBar =
    document.getElementById(
        "authBar"
    );

const loginDisplayName =
    document.getElementById(
        "loginDisplayName"
    );

const loginRole =
    document.getElementById(
        "loginRole"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );

const inviteSection =
    document.getElementById(
        "inviteSection"
    );

const inviteCodeInput =
    document.getElementById(
        "inviteCodeInput"
    );

const claimInviteButton =
    document.getElementById(
        "claimInviteButton"
    );

const inviteMessage =
    document.getElementById(
        "inviteMessage"
    );

const authError =
    document.getElementById(
        "authError"
    );

const authErrorMessage =
    document.getElementById(
        "authErrorMessage"
    );

const adminContent =
    document.getElementById(
        "adminContent"
    );

const roomName =
    document.getElementById(
        "roomName"
    );

const moderatorName =
    document.getElementById(
        "moderatorName"
    );

const roomCount =
    document.getElementById(
        "roomCount"
    );

const roomCapacity =
    document.getElementById(
        "roomCapacity"
    );

const roomState =
    document.getElementById(
        "roomState"
    );

const roomMemberList =
    document.getElementById(
        "roomMemberList"
    );

const mainWaitingList =
    document.getElementById(
        "mainWaitingList"
    );

const refreshButton =
    document.getElementById(
        "refreshButton"
    );


// ========================================
// 状態
// ========================================

let currentUser =
    null;

let currentProfile =
    null;

let currentRoom =
    null;

let participants =
    [];

let authReady =
    false;

let refreshing =
    false;

let claimingInvite =
    false;


// ========================================
// URLから部屋ID
// ========================================

function getRoomIdFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    return params.get(
        "room"
    );
}


const ROOM_ID =
    getRoomIdFromUrl();


// ========================================
// 表示切り替え
// ========================================

function hideAllPanels() {

    authBar.style.display =
        "none";

    inviteSection.style.display =
        "none";

    authError.style.display =
        "none";

    adminContent.style.display =
        "none";
}


function showInvitePanel() {

    hideAllPanels();


    inviteSection.style.display =
        "block";


    connectionStatus.textContent =
        "🎟 招待コードを入力してください";
}


function showError(
    text
) {

    hideAllPanels();


    authError.style.display =
        "block";


    authErrorMessage.textContent =
        text;
}


function setInviteMessage(
    text,
    isError = false
) {

    inviteMessage.textContent =
        text;


    inviteMessage.style.color =
        isError
            ? "#ff7777"
            : "#ffcc66";
}


// ========================================
// 管理者プロフィール取得
// ========================================

async function loadAdminProfile(
    userId
) {

    if (!userId) {

        return null;
    }


    const {
        data,
        error
    } =
        await roomAdminSupabase
            .from(
                "admin_users"
            )
            .select(
                "user_id, role, display_name"
            )
            .eq(
                "user_id",
                userId
            )
            .maybeSingle();


    if (error) {

        console.error(
            "管理者プロフィール取得エラー:",
            error
        );


        return null;
    }


    return data || null;
}


// ========================================
// 部屋取得
// ========================================

async function loadRoom() {

    if (!ROOM_ID) {

        connectionStatus.textContent =
            "❌ 部屋IDがありません";


        showError(
            "管理URLが正しくありません。"
        );


        return false;
    }


    const {
        data,
        error
    } =
        await roomAdminSupabase
            .from(
                "rooms"
            )
            .select("*")
            .eq(
                "id",
                ROOM_ID
            )
            .eq(
                "is_active",
                true
            )
            .maybeSingle();


    if (error) {

        console.error(
            "部屋取得エラー:",
            error
        );


        connectionStatus.textContent =
            "❌ 部屋情報取得エラー";


        return false;
    }


    if (!data) {

        connectionStatus.textContent =
            "⚠️ 部屋が見つかりません";


        showError(
            "この待機部屋は存在しないか、すでに閉じられています。"
        );


        return false;
    }


    currentRoom =
        data;


    return true;
}


// ========================================
// 担当権限確認
// ========================================

function canManageCurrentRoom() {

    if (
        !currentUser ||
        !currentProfile ||
        !currentRoom
    ) {

        return false;
    }


    // Ownerは全部屋OK
    if (
        currentProfile.role ===
        "owner"
    ) {

        return true;
    }


    // Moderatorは担当部屋のみ
    return (
        currentProfile.role ===
            "moderator" &&
        currentRoom.moderator_user_id ===
            currentUser.id
    );
}


// ========================================
// ログイン済み表示
// ========================================

function showLoggedInUser() {

    authBar.style.display =
        "block";


    loginDisplayName.textContent =
        currentProfile?.display_name ||
        "Moderator";


    loginRole.textContent =
        currentProfile?.role ===
            "owner"
            ? " / Owner"
            : " / Moderator";
}


// ========================================
// 既存セッション認証
// ========================================

async function authorizeExistingSession() {

    if (!currentUser) {

        return false;
    }


    currentProfile =
        await loadAdminProfile(
            currentUser.id
        );


    // 匿名ログイン済みだが
    // まだ招待コード未使用
    if (!currentProfile) {

        showInvitePanel();

        return false;
    }


    const roomLoaded =
        await loadRoom();


    if (!roomLoaded) {

        return false;
    }


    if (
        !canManageCurrentRoom()
    ) {

        // 別部屋のModerator権限が残っている場合は
        // エラーで止めず、招待コード入力画面を表示
        if (
            currentProfile.role ===
            "moderator"
        ) {

            showInvitePanel();


            setInviteMessage(
                "この待機部屋の招待コードを入力してください。"
            );


            return false;
        }


        connectionStatus.textContent =
            "🔒 権限なし";


        showError(
            "この端末には、この待機部屋を管理する権限がありません。"
        );


        return false;
    }


    hideAllPanels();


    showLoggedInUser();


    adminContent.style.display =
        "block";


    connectionStatus.textContent =
        "🟢 接続中";


    authReady =
        true;


    await refreshAll();


    return true;
}


// ========================================
// 匿名ログイン
// ========================================

async function ensureAnonymousSession() {

    const {
        data: sessionData,
        error: sessionError
    } =
        await roomAdminSupabase
            .auth
            .getSession();


    if (sessionError) {

        throw sessionError;
    }


    const existingUser =
        sessionData
            .session
            ?.user ||
        null;


    // =====================================
    // すでに匿名ユーザーなら再利用
    // =====================================

    if (
        existingUser &&
        existingUser.is_anonymous === true
    ) {

        currentUser =
            existingUser;


        return currentUser;
    }


    // =====================================
    // Ownerなど通常アカウントが残っていたら
    // Moderator用途には絶対使わない
    // =====================================

    if (existingUser) {

        await roomAdminSupabase
            .auth
            .signOut({
                scope: "local"
            });
    }


    // =====================================
    // 新しい匿名ユーザーを作成
    // =====================================

    const {
        data,
        error
    } =
        await roomAdminSupabase
            .auth
            .signInAnonymously();


    if (error) {

        throw error;
    }


    if (
        !data ||
        !data.user
    ) {

        throw new Error(
            "匿名ログインに失敗しました。"
        );
    }


    currentUser =
        data.user;


    return currentUser;
}


// ========================================
// 招待コード使用
// ========================================

async function claimInvite() {

    if (claimingInvite) {

        return;
    }


    const code =
        inviteCodeInput
            .value
            .trim()
            .toUpperCase();


    if (!code) {

        setInviteMessage(
            "招待コードを入力してください。",
            true
        );


        return;
    }


    claimingInvite =
        true;


    claimInviteButton.disabled =
        true;


    claimInviteButton.textContent =
        "確認中…";


    setInviteMessage(
        "管理権限を確認しています…"
    );


try {

    // =====================================
    // 別部屋のModeratorセッションを切替
    // =====================================

    if (
        currentUser &&
        currentProfile?.role === "moderator" &&
        currentRoom &&
        currentRoom.moderator_user_id !== currentUser.id
    ) {

        await roomAdminSupabase
            .auth
            .signOut({
                scope: "local"
            });

        currentUser = null;
        currentProfile = null;
    }

    // =====================================
    // 匿名Authユーザーを確保
    // =====================================

    await ensureAnonymousSession();


        // =====================================
        // 招待コードをclaim
        // =====================================

        const {
            data,
            error
        } =
            await roomAdminSupabase
                .rpc(
                    "claim_moderator_invite",
                    {
                        p_invite_code:
                            code
                    }
                );


        if (error) {

            throw error;
        }


        if (
            !data ||
            !data.success
        ) {

            throw new Error(
                "招待コードを確認できませんでした。"
            );
        }


        // =====================================
        // 別部屋コードの誤使用防止
        // =====================================

        if (
            data.room_id !==
            ROOM_ID
        ) {

            throw new Error(
                "この招待コードは別の待機部屋用です。"
            );
        }


        inviteCodeInput.value =
            "";


        currentProfile =
            await loadAdminProfile(
                currentUser.id
            );


        const roomLoaded =
            await loadRoom();


        if (!roomLoaded) {

            throw new Error(
                "待機部屋を取得できませんでした。"
            );
        }


        if (
            !canManageCurrentRoom()
        ) {

            throw new Error(
                "待機部屋の管理権限を確認できませんでした。"
            );
        }


        hideAllPanels();


        showLoggedInUser();


        adminContent.style.display =
            "block";


        connectionStatus.textContent =
            "🟢 接続中";


        authReady =
            true;


        await refreshAll();

    } catch (error) {

        console.error(
            "Moderator招待エラー:",
            error
        );


        setInviteMessage(
            error.message ||
            "招待コードを使用できませんでした。",
            true
        );

    } finally {

        claimingInvite =
            false;


        claimInviteButton.disabled =
            false;


        claimInviteButton.textContent =
            "🏠 管理を開始する";
    }
}


// ========================================
// 管理権限解除
// ========================================

async function logoutModerator() {

    const confirmed =
        confirm(
            "この端末の管理権限を解除しますか？\n\n" +
            "匿名Moderatorは、ログアウトすると同じ権限には戻れません。\n" +
            "再度管理する場合は、新しい招待コードが必要です。"
        );


    if (!confirmed) {

        return;
    }


    await roomAdminSupabase
        .auth
        .signOut({
            scope:
                "local"
        });


    currentUser =
        null;

    currentProfile =
        null;

    currentRoom =
        null;

    participants =
        [];

    authReady =
        false;


    showInvitePanel();


    setInviteMessage(
        "管理権限を解除しました。"
    );
}


// ========================================
// 参加者取得
// ========================================

async function loadParticipants() {

    if (!currentRoom) {

        participants = [];

        return false;
    }


    const {
        data,
        error
    } =
        await roomAdminSupabase
            .from(
                "participants"
            )
            .select("*")
            .eq(
                "session_id",
                currentRoom.session_id
            )
            .order(
                "display_order",
                {
                    ascending: true,
                    nullsFirst: false
                }
            )
            .order(
                "joined_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "参加者取得エラー:",
            error
        );


        connectionStatus.textContent =
            "⚠️ 参加者取得エラー";


        return false;
    }


    participants =
        data || [];


    return true;
}


// ========================================
// 初参加 / 再参加判定
// ========================================

function isRejoinPerson(
    person
) {

    if (!person) {

        return false;
    }


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
            ) >= 1000000
        )
    );
}


// ========================================
// 空表示
// ========================================

function createEmptyCard(
    text
) {

    const div =
        document.createElement(
            "div"
        );


    div.className =
        "empty-card";


    div.textContent =
        text;


    return div;
}


// ========================================
// メイン待機順位
// ========================================

function getWaitingPosition(
    target
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
                target.id
        );


    if (
        index === -1
    ) {

        return "-";
    }


    return index + 1;
}


// ========================================
// 描画
// ========================================

function render() {

    if (!currentRoom) {

        return;
    }


    roomName.textContent =
        `🏠 ${currentRoom.name}`;


    moderatorName.textContent =
        currentProfile?.display_name ||
        currentRoom.moderator_name ||
        "Moderator";


    roomCapacity.textContent =
        currentRoom.capacity;


    const members =
        participants.filter(
            person =>
                person.room_id ===
                currentRoom.id
        );


    const waiting =
        participants.filter(
            person =>
                person.status ===
                    "waiting" &&
                person.room_id ===
                    null
        );


    roomCount.textContent =
        members.length;


    const capacity =
        Number(
            currentRoom.capacity
        );


    const free =
        Math.max(
            0,
            capacity -
            members.length
        );


    roomState.textContent =
        members.length >=
            capacity
            ? "🔴 満員です"
            : `🟢 空き ${free}人`;


    renderMembers(
        members
    );


    renderWaiting(
        waiting,
        members.length,
        capacity
    );
}


// ========================================
// 部屋メンバー表示
// ========================================

function renderMembers(
    members
) {

    roomMemberList.innerHTML =
        "";


    if (
        members.length === 0
    ) {

        roomMemberList.appendChild(
            createEmptyCard(
                "現在、この部屋にいる人はいません"
            )
        );


        return;
    }


    members.forEach(
        person => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "person-card";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "person-name";


            name.textContent =
                person.name;


            const badge =
                document.createElement(
                    "span"
                );


            badge.className =
                isRejoinPerson(
                    person
                )
                    ? "badge badge-rejoin"
                    : "badge badge-initial";


            badge.textContent =
                isRejoinPerson(
                    person
                )
                    ? "🔁 再参加"
                    : "🆕 初参加";


            const meta =
                document.createElement(
                    "div"
                );


            meta.className =
                "person-meta";


meta.innerHTML =
    `メイン待機：
    <strong>
        ${getWaitingPosition(person)}番
    </strong>`;


const gameName =
    document.createElement(
        "div"
    );


gameName.className =
    "person-meta";


gameName.textContent =
    person.game_name
        ? `🎮 スプラ名：${person.game_name}`
        : "🎮 スプラ名：未登録";


            const returnButton =
                document.createElement(
                    "button"
                );


            returnButton.type =
                "button";


            returnButton.className =
                "action-button return-button";


            returnButton.textContent =
                "↩ メイン待機へ戻す";


            returnButton.onclick =
                () =>
                    returnToMain(
                        person
                    );


            card.appendChild(
                name
            );

            card.appendChild(
                badge
            );

            card.appendChild(
                meta
            );

            card.appendChild(
                gameName
            );

            card.appendChild(
                returnButton
            );


            roomMemberList.appendChild(
                card
            );
        }
    );
}


// ========================================
// メイン待機表示
// ========================================

function renderWaiting(
    waiting,
    memberCount,
    capacity
) {

    mainWaitingList.innerHTML =
        "";


    if (
        waiting.length === 0
    ) {

        mainWaitingList.appendChild(
            createEmptyCard(
                "現在、メイン待機者はいません"
            )
        );


        return;
    }


    waiting.forEach(
        person => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "person-card";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "person-name";


            name.textContent =
                person.name;


            const badge =
                document.createElement(
                    "span"
                );


            badge.className =
                isRejoinPerson(
                    person
                )
                    ? "badge badge-rejoin"
                    : "badge badge-initial";


            badge.textContent =
                isRejoinPerson(
                    person
                )
                    ? "🔁 再参加"
                    : "🆕 初参加";


            const meta =
                document.createElement(
                    "div"
                );


            meta.className =
                "person-meta";


meta.innerHTML =
    `現在
    <strong>
        ${getWaitingPosition(person)}番
    </strong>
    ／ メイン待機`;


const gameName =
    document.createElement(
        "div"
    );


gameName.className =
    "person-meta";


gameName.textContent =
    person.game_name
        ? `🎮 スプラ名：${person.game_name}`
        : "🎮 スプラ名：未登録";


            const addButton =
                document.createElement(
                    "button"
                );


            addButton.type =
                "button";


            addButton.className =
                "action-button";


            addButton.textContent =
                "🏠 この部屋へ";


            if (
                memberCount >=
                capacity
            ) {

                addButton.disabled =
                    true;


                addButton.textContent =
                    "満員です";
            }


            addButton.onclick =
                () =>
                    moveToRoom(
                        person
                    );


            card.appendChild(
                name
            );

            card.appendChild(
                badge
            );

            card.appendChild(
                meta
            );

            card.appendChild(
                gameName
            );

            card.appendChild(
                addButton
            );


            mainWaitingList.appendChild(
                card
            );
        }
    );
}


// ========================================
// RPC：この部屋へ
// ========================================

async function moveToRoom(
    person
) {

    if (
        !person ||
        !currentRoom
    ) {

        return;
    }


    const confirmed =
        confirm(
            `${person.name}さんを\n` +
            `${currentRoom.name}\n` +
            `へ移動しますか？\n\n` +
            `メイン待機順位は維持されます。`
        );


    if (!confirmed) {

        return;
    }


    const {
        data,
        error
    } =
        await roomAdminSupabase
            .rpc(
                "moderator_move_to_room",
                {
                    p_participant_id:
                        person.id,

                    p_room_id:
                        currentRoom.id
                }
            );


    if (error) {

        console.error(
            "部屋移動RPCエラー:",
            error
        );


        alert(
            error.message ||
            "部屋へ移動できませんでした。"
        );


        return;
    }


    console.log(
        "部屋移動成功:",
        data
    );


    await refreshAll();
}


// ========================================
// RPC：メインへ戻す
// ========================================

async function returnToMain(
    person
) {

    if (
        !person ||
        !currentRoom
    ) {

        return;
    }


    const confirmed =
        confirm(
            `${person.name}さんをメイン待機へ戻しますか？`
        );


    if (!confirmed) {

        return;
    }


    const {
        data,
        error
    } =
        await roomAdminSupabase
            .rpc(
                "moderator_return_to_main",
                {
                    p_participant_id:
                        person.id,

                    p_room_id:
                        currentRoom.id
                }
            );


    if (error) {

        console.error(
            "メイン復帰RPCエラー:",
            error
        );


        alert(
            error.message ||
            "メイン待機へ戻せませんでした。"
        );


        return;
    }


    console.log(
        "メイン復帰成功:",
        data
    );


    await refreshAll();
}


// ========================================
// 全更新
// ========================================

async function refreshAll() {

    if (
        refreshing ||
        !authReady
    ) {

        return;
    }


    refreshing =
        true;


    refreshButton.disabled =
        true;


    refreshButton.textContent =
        "更新中…";


    const roomLoaded =
        await loadRoom();


    if (!roomLoaded) {

        refreshing =
            false;

        refreshButton.disabled =
            false;

        refreshButton.textContent =
            "🔄 最新情報に更新";

        return;
    }


    if (
        !canManageCurrentRoom()
    ) {

        authReady =
            false;


        connectionStatus.textContent =
            "🔒 権限なし";


        showError(
            "この端末には、この待機部屋の管理権限がありません。"
        );


        refreshing =
            false;


        refreshButton.disabled =
            false;


        refreshButton.textContent =
            "🔄 最新情報に更新";


        return;
    }


    await loadParticipants();


    render();


    connectionStatus.textContent =
        "🟢 接続中";


    refreshButton.disabled =
        false;


    refreshButton.textContent =
        "🔄 最新情報に更新";


    refreshing =
        false;
}


// ========================================
// 初期化
// ========================================

async function initialize() {

    hideAllPanels();


    connectionStatus.textContent =
        "🔄 認証確認中…";


    if (!ROOM_ID) {

        connectionStatus.textContent =
            "❌ 部屋IDがありません";


        showError(
            "管理URLが正しくありません。"
        );


        return;
    }


    try {

        const {
            data,
            error
        } =
            await roomAdminSupabase
                .auth
                .getSession();


        if (error) {

            throw error;
        }


        // =====================================
        // 未ログイン
        // =====================================

        if (
            !data.session ||
            !data.session.user
        ) {

            showInvitePanel();

            return;
        }


        // =====================================
        // 既存セッション
        // =====================================

        currentUser =
            data.session.user;


        await authorizeExistingSession();

    } catch (error) {

        console.error(
            "初期認証エラー:",
            error
        );


        connectionStatus.textContent =
            "❌ 認証エラー";


        showError(
            "認証状態を確認できませんでした。"
        );
    }
}


// ========================================
// イベント
// ========================================

claimInviteButton.addEventListener(
    "click",
    claimInvite
);


inviteCodeInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Enter" &&
            !claimInviteButton.disabled
        ) {

            event.preventDefault();

            claimInviteButton.click();
        }
    }
);


inviteCodeInput.addEventListener(
    "input",
    () => {

        inviteCodeInput.value =
            inviteCodeInput
                .value
                .toUpperCase()
                .replace(
                    /\s/g,
                    ""
                );
    }
);


refreshButton.addEventListener(
    "click",
    refreshAll
);


logoutButton.addEventListener(
    "click",
    logoutModerator
);


// ========================================
// Auth状態変更
// ========================================

roomAdminSupabase
    .auth
    .onAuthStateChange(
        (
            event,
            session
        ) => {

            if (
                event ===
                "SIGNED_OUT"
            ) {

                currentUser =
                    null;

                currentProfile =
                    null;

                currentRoom =
                    null;

                participants =
                    [];

                authReady =
                    false;
            }
        }
    );


// ========================================
// 起動
// ========================================

initialize();


// ========================================
// 自動更新
// ========================================

setInterval(
    async () => {

        if (
            document.hidden ||
            refreshing ||
            !authReady
        ) {

            return;
        }


        await refreshAll();

    },
    4000
);