/**
 * Entry status text shared by the gate and workspace recovery.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Content
 * @author AI-Generated
 * @date 2026-11-25
 */

export const entryText = {
  checking: ["\u6b63\u5728\u786e\u8ba4\u8bbf\u95ee\u6743\u9650", "\u5b8c\u6210\u9a8c\u8bc1\u540e\u5c06\u81ea\u52a8\u8fdb\u5165\u4ea7\u54c1", "Checking access", "You will enter the product when the check is complete."],
  signin: ["\u767b\u5f55", "\u4f7f\u7528\u5e73\u53f0\u8d26\u53f7\u767b\u5f55\u5e76\u8fdb\u5165\u5de5\u4f5c\u7a7a\u95f4", "Sign in", "Use your platform account to enter the workspace."],
  recover: ["\u7b49\u5f85\u6062\u590d\u767b\u5f55", "\u8bf7\u4fdd\u7559\u5f53\u524d\u9875\u9762\uff0c\u5728\u65b0\u6807\u7b7e\u767b\u5f55\u540e\u56de\u6765\u91cd\u65b0\u68c0\u67e5", "Sign in to resume", "Keep this page open. Sign in in another tab, then check again."],
  unavailable: ["\u6743\u9650\u6682\u4e0d\u53ef\u7528", "\u6682\u65f6\u65e0\u6cd5\u786e\u8ba4\u6743\u9650\uff0c\u8bf7\u7a0d\u540e\u91cd\u65b0\u68c0\u67e5", "Access is temporarily unavailable", "Try the access check again in a moment."],
  connection: ["\u8fde\u63a5\u5931\u8d25", "\u672a\u80fd\u5b8c\u6210\u8bbf\u95ee\u68c0\u67e5\uff0c\u8bf7\u91cd\u65b0\u8fde\u63a5", "Connection failed", "Reconnect to check access again."],
  offline: ["\u5f53\u524d\u79bb\u7ebf", "\u6062\u590d\u7f51\u7edc\u8fde\u63a5\u540e\u91cd\u65b0\u68c0\u67e5", "You are offline", "Reconnect to the network, then check again."],
  limited: ["\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41", "\u8bf7\u7b49\u7247\u523b\u518d\u8bd5", "Too many requests", "Wait a moment before checking again."],
  inactive: ["\u8d26\u53f7\u4e0d\u53ef\u7528", "\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u786e\u8ba4\u8d26\u53f7\u72b6\u6001", "Account unavailable", "Contact your administrator about your account status."],
  workspace: ["\u6ca1\u6709\u53ef\u7528\u5de5\u4f5c\u7a7a\u95f4", "\u524d\u5f80\u63a7\u5236\u53f0\u521b\u5efa\u6216\u52a0\u5165\u5de5\u4f5c\u7a7a\u95f4", "No workspace available", "Open the console to create or join a workspace."],
  "seat-required": ["需要产品使用权限", "请联系工作空间管理员为你分配产品席位", "Product access required", "Ask your workspace administrator to assign product access."],
  subscription: ["\u5c1a\u672a\u5f00\u901a", "\u5f53\u524d\u5de5\u4f5c\u7a7a\u95f4\u5c1a\u672a\u5f00\u901a\u6b64\u4ea7\u54c1", "Subscription required", "This workspace has no active subscription for this product."],
  renew: ["\u8ba2\u9605\u9700\u8981\u5904\u7406", "\u5f53\u524d\u5de5\u4f5c\u7a7a\u95f4\u7684\u8ba2\u9605\u9700\u8981\u7eed\u8ba2\u6216\u5904\u7406\u4ed8\u6b3e", "Subscription needs attention", "Renew your subscription or resolve its payment status."],
  "subscription-member": ["\u5c1a\u672a\u5f00\u901a", "\u8bf7\u8054\u7cfb\u5de5\u4f5c\u7a7a\u95f4\u7ba1\u7406\u5458\u5f00\u901a\u6b64\u4ea7\u54c1", "Subscription required", "Ask your workspace administrator to activate this product."],
  "renew-member": ["\u8ba2\u9605\u9700\u8981\u5904\u7406", "\u8bf7\u8054\u7cfb\u5de5\u4f5c\u7a7a\u95f4\u7ba1\u7406\u5458\u5904\u7406\u8ba2\u9605", "Subscription needs attention", "Ask your workspace administrator to review the subscription."],
  unconfigured: ["\u4ea7\u54c1\u6682\u4e0d\u53ef\u7528", "\u6b64\u73af\u5883\u5c1a\u672a\u914d\u7f6e\u767b\u5f55\uff0c\u8bf7\u8054\u7cfb\u652f\u6301", "Product unavailable", "Sign-in is unavailable in this environment. Contact support."],
  cancelled: ["\u5df2\u53d6\u6d88\u767b\u5f55", "\u53ef\u91cd\u65b0\u5f00\u59cb\u767b\u5f55", "Sign-in cancelled", "You can start sign-in again."],
  callback: ["\u672a\u80fd\u5b8c\u6210\u767b\u5f55", "\u672c\u6b21\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u5f00\u59cb", "Sign-in did not complete", "This sign-in attempt is no longer valid. Start again."],
  changed: ["\u5de5\u4f5c\u7a7a\u95f4\u6216\u8d26\u53f7\u5df2\u53d8\u66f4", "\u65e7\u5de5\u4f5c\u5185\u5bb9\u5df2\u9694\u79bb\u3002\u53ef\u5728\u5f53\u524d\u5de5\u4f5c\u7a7a\u95f4\u91cd\u65b0\u5f00\u59cb", "Account or workspace changed", "Previous work is isolated. You can start again in the current workspace."],
} as const;

export type EntryStatus = keyof typeof entryText;
export type EntryLocale = "zh-CN" | "en-US";
