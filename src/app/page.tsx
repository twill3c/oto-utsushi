import Utsushi from "@/components/Utsushi";
import { PASSAGES } from "@/core/catalog";

export default function Page() {
  return (
    <main>
      <h1>音写ラボ</h1>
      <p className="tagline">
        青空文庫の一節を声に出して読み、機械が聞き落とす場所を原文の上に描く。
        推論はブラウザの中で完結し、音声も文字もどこへも送らない。
      </p>

      <p className="note">
        音声認識のアプリはたいてい「認識結果」を出して終わる。
        その結果が正しいかは誰も知らない。ここでは順序を逆にした —
        <strong>正解が先に画面に在り</strong>、それを読み上げる。
        測るのは人の滑舌ではなく、<strong>機械の側の癖</strong>である。
      </p>

      <Utsushi />

      <h2>いまどこまで出来ているか</h2>
      <p className="lede">
        計り方(正規化・整列・計量・音声の前処理)と、その正しさを縛るゲートまでが
        出来ている。課題文は {PASSAGES.length} 篇。
        ブラウザ内 Whisper と録音はこの次の段で載る。
      </p>
    </main>
  );
}
