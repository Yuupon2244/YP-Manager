// ========================================
// YP-Manager 待機一覧レイアウト調整
// ========================================

"use strict";

(function () {

    function moveWaitingHeading() {

        const waitingList =
            document.getElementById(
                "waitingList"
            );

        const dashboard =
            document.getElementById(
                "lobbyDashboard"
            );

        if (
            !waitingList ||
            !dashboard
        ) {
            return;
        }

        const section =
            waitingList.parentElement;

        if (!section) {
            return;
        }

        const heading =
            Array.from(
                section.children
            ).find(
                element =>
                    element.tagName === "H2"
            );

        if (
            !heading ||
            dashboard.parentElement !== section
        ) {
            return;
        }

        /*
         * ロビー情報を見出しの上に配置する。
         * すでに正しい順番なら何もしない。
         */
        if (
            dashboard.nextElementSibling !== heading
        ) {
            section.insertBefore(
                dashboard,
                heading
            );
        }
    }


    function start() {

        moveWaitingHeading();

        const waitingList =
            document.getElementById(
                "waitingList"
            );

        if (!waitingList) {
            return;
        }

        const section =
            waitingList.parentElement;

        if (!section) {
            return;
        }

        /*
         * ロビー情報が後から作られても
         * 見出しの位置を自動調整する。
         */
        const observer =
            new MutationObserver(
                moveWaitingHeading
            );

        observer.observe(
            section,
            {
                childList: true,
                subtree: true
            }
        );

    }


    if (
        document.readyState === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true
            }
        );

    } else {

        start();

    }

})();