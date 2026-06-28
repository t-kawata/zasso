// OMISSIONS Slack通知テスト
// 使い方: node test-omissions-notification.mjs <slack_url> <omissions_json>
//
// 修正後の sendOmissionsNotification → buildOmissionsBlocks を経由して
// 実際に Slack に通知を飛ばす。目視確認用。

import path from "node:path";
import { sendOmissionsNotification } from "./dist/notifier.js";

const webhookUrl = process.argv[2];
const omissionsPath = process.argv[3];

if (!webhookUrl || !omissionsPath) {
  console.error(
    "使い方: node test-omissions-notification.mjs <slack_url> <omissions_json>",
  );
  process.exit(1);
}

const cwd = path.dirname(path.resolve(omissionsPath));
console.log("Sending to Slack...");
await sendOmissionsNotification(webhookUrl, cwd);
console.log("✅ 送信完了。Slack を確認してください。");
