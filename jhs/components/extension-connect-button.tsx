"use client";

export function ExtensionConnectButton() {
  async function connectExtension() {
    try {
      const res = await fetch("/api/auth/session");

      if (!res.ok) {
        alert("세션 정보를 불러오지 못했습니다.");
        return;
      }

      const session = await res.json();
      const userId = session?.user?.id;

      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      await navigator.clipboard.writeText(userId);

      alert("사용자 ID가 복사되었습니다. 확장프로그램에 붙여넣으세요.");
    } catch (error) {
      alert("확장프로그램 연결 중 오류가 발생했습니다.");
    }
  }

  return (
    <button
      type="button"
      onClick={connectExtension}
      className="rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
    >
      📺 Chrome Extension 연결
    </button>
  );
}
