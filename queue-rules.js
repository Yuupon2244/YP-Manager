/* =====================================
   YP-Manager 共通のメイン待機列ルール
   - 待機部屋所属者をメイン待機列から除外
   - チャット専用・配信者アカウントを除外
   - 初参加優先 → display_order → joined_at → id の順に並べる
===================================== */
(function () {
    "use strict";

    const HOST_SETTING_KEY = "main_lobby_host_name";
    const HOST_CACHE_KEY = "yp_manager_main_lobby_host_name_cache";
    const HOST_CACHE_AT_KEY = "yp_manager_main_lobby_host_name_cache_at";
    const HOST_CACHE_TTL_MS = 30 * 1000;

    let hostName = "";
    let hostCacheAt = 0;
    let hostRefreshPromise = null;

    try {
        hostName = String(localStorage.getItem(HOST_CACHE_KEY) || "").trim();
        hostCacheAt = Number(localStorage.getItem(HOST_CACHE_AT_KEY) || 0);
    } catch (_) {
        // localStorage が使えない環境でもルール自体は利用可能。
    }

    function normalizeName(value) {
        return String(value || "")
            .normalize("NFKC")
            .trim()
            .replace(/^@+/, "")
            .replace(/[\s\u3000]+/g, "")
            .toLocaleLowerCase("ja-JP");
    }

    function setHostName(value) {
        hostName = String(value == null ? "" : value).trim();
        hostCacheAt = Date.now();
        try {
            localStorage.setItem(HOST_CACHE_KEY, hostName);
            localStorage.setItem(HOST_CACHE_AT_KEY, String(hostCacheAt));
        } catch (_) {
            // localStorage が使えない環境ではメモリ内だけで保持。
        }
    }

    async function refreshHostName(supabaseClient, force) {
        if (!supabaseClient || typeof supabaseClient.from !== "function") {
            return hostName;
        }

        if (!force && hostCacheAt && Date.now() - hostCacheAt < HOST_CACHE_TTL_MS) {
            return hostName;
        }

        if (hostRefreshPromise) {
            return hostRefreshPromise;
        }

        hostRefreshPromise = (async function () {
            try {
                const { data, error } = await supabaseClient
                    .from("app_settings")
                    .select("value")
                    .eq("key", HOST_SETTING_KEY)
                    .maybeSingle();

                if (error) throw error;
                setHostName(data && data.value != null ? data.value : "");
            } catch (error) {
                // 設定取得に失敗しても、キャッシュ済みの名前で表示を続ける。
                console.warn("[YP-Manager] 配信者名の共通設定取得に失敗:", error);
            } finally {
                hostRefreshPromise = null;
            }
            return hostName;
        })();

        return hostRefreshPromise;
    }

    // =====================================
    // チャット専用判定
    // =====================================

    function isChatOnlyPerson(person) {
        if (!person) return false;

        const status = String(person.status || "").trim().toLowerCase();
        const lobbyState = String(person.lobby_state || "").trim().toLowerCase();
        const source = String(person.source || "").trim().toLowerCase();
        const note = String(person.note || "").trim().toLowerCase();

        // 正式状態を最優先する。
        // participants_normalize_chat_only トリガーにより、
        // チャット専用は status/lobby_state が chat_only に統一される。
        if (
            person.chat_only === true ||
            status === "chat_only" ||
            lobbyState === "chat_only" ||
            source === "chat" ||
            note === "chat_only"
        ) {
            return true;
        }

        // 旧データ互換：
        // 以前は status=viewer / note=viewer で
        // チャット専用を表していた。
        //
        // lobby_state=watching が明示された観戦者は
        // チャット専用として扱わない。
        return (
            status === "viewer" &&
            note === "viewer" &&
            lobbyState !== "watching"
        );
    }

    // =====================================
    // 配信者判定
    // =====================================

    function isHost(person, explicitHostName) {
        const comparisonName = explicitHostName == null ? hostName : String(explicitHostName);
        const normalizedHost = normalizeName(comparisonName);

        return Boolean(
            normalizedHost &&
            normalizeName(person && person.name) === normalizedHost
        );
    }

    // =====================================
    // メイン待機列参加候補判定
    // =====================================

    function isMainWaitingCandidate(person, explicitHostName) {
        const roomId = person && person.room_id;

        const hasRoom =
            roomId !== null &&
            roomId !== undefined &&
            String(roomId).trim() !== "";

        return Boolean(
            person &&
            person.status === "waiting" &&
            !hasRoom &&
            !isChatOnlyPerson(person) &&
            !isHost(person, explicitHostName)
        );
    }

    // =====================================
    // 初参加判定
    // =====================================

    function isFirstParticipationPending(person) {
        return Boolean(
            person && (
                person.first_participation_pending === true ||
                (
                    person.first_participation_pending == null &&
                    person.note === "initial"
                )
            )
        );
    }

    // =====================================
    // 順番比較
    // =====================================

    function orderCompare(a, b) {
        const aValue = a && a.display_order;
        const bValue = b && b.display_order;

        const aHasOrder =
            aValue !== null &&
            aValue !== undefined &&
            String(aValue).trim() !== "" &&
            Number.isFinite(Number(aValue));

        const bHasOrder =
            bValue !== null &&
            bValue !== undefined &&
            String(bValue).trim() !== "" &&
            Number.isFinite(Number(bValue));

        if (
            aHasOrder &&
            bHasOrder &&
            Number(aValue) !== Number(bValue)
        ) {
            return Number(aValue) - Number(bValue);
        }

        if (aHasOrder && !bHasOrder) return -1;
        if (!aHasOrder && bHasOrder) return 1;

        const joinedCompare =
            String((a && a.joined_at) || "").localeCompare(
                String((b && b.joined_at) || "")
            );

        if (joinedCompare !== 0) return joinedCompare;

        return String((a && a.id) || "").localeCompare(
            String((b && b.id) || "")
        );
    }

    // =====================================
    // メイン待機列の並び替え
    // =====================================

    function sortMainWaiting(people, explicitHostName) {
        return (Array.isArray(people) ? people : [])
            .filter(person =>
                isMainWaitingCandidate(person, explicitHostName)
            )
            .sort((a, b) => {
                const aNew =
                    isFirstParticipationPending(a) ? 0 : 1;

                const bNew =
                    isFirstParticipationPending(b) ? 0 : 1;

                if (aNew !== bNew) {
                    return aNew - bNew;
                }

                return orderCompare(a, b);
            });
    }

    // =====================================
    // 共通機能公開
    // =====================================

    window.YPQueueRules = {
        getHostName: () => hostName,
        setHostName,
        refreshHostName,
        isChatOnlyPerson,
        isHost,
        isMainWaitingCandidate,
        isFirstParticipationPending,
        orderCompare,
        sortMainWaiting
    };

})();