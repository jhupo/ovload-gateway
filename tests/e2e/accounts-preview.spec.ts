import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "../../web/node_modules/@playwright/test";
for (const mobile of [false, true])
  for (const theme of ["light", "dark"] as const) {
    test(`accounts ${mobile ? "mobile" : "desktop"} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      );
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(() => {
        sessionStorage.setItem("ovload.admin-preview", "active");
        localStorage.setItem("i18nextLng", "zh");
      });
      const errors: string[] = [];
      const writes: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()))
          writes.push(r.url());
      });
      const out = resolve("output/account-onboarding-qa");
      await mkdir(out, { recursive: true });
      const shot = async (name: string) => {
        await page.waitForTimeout(250);
        await page.screenshot({
          path: resolve(
            out,
            `${mobile ? "mobile" : "desktop"}-${theme}-${name}.png`,
          ),
          animations: "disabled",
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      };
      await page.goto("/accounts");
      await expect(
        page.getByRole("heading", { name: "账号管理", exact: true }),
      ).toBeVisible();
      await shot("list");
      if (!mobile) {
        await page.getByRole("button", { name: "视图", exact: true }).click();
        await shot("view");
        await page
          .getByRole("menuitemcheckbox", { name: "套餐", exact: true })
          .click();
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("columnheader", { name: "套餐", exact: true }),
        ).toHaveCount(0);
        await shot("view-hidden");
        await page.getByRole("button", { name: "视图", exact: true }).click();
        await page
          .getByRole("menuitemcheckbox", { name: "套餐", exact: true })
          .click();
        await page.keyboard.press("Escape");
      }
      await page.getByRole("button", { name: "添加账号", exact: true }).click();
      let editor = page.getByRole("dialog", { name: /添加账号/ });
      await shot("settings");
      const bounds = await editor.boundingBox();
      expect(bounds!.height).toBeLessThan(600);
      await expect(editor.getByRole("textbox", {name:"账号名称",exact:true})).toHaveCount(0);
      await editor.getByRole("spinbutton", {name:"并发上限",exact:true}).fill("0");
      await editor.getByRole("button", {name:"下一步",exact:true}).click();
      await expect(editor.getByRole("spinbutton", {name:"并发上限",exact:true})).toHaveAttribute("aria-invalid","true");
      await shot("settings-invalid");
      await editor.getByRole("spinbutton", {name:"并发上限",exact:true}).fill("16");
      await editor.getByRole("button", {name:"分组",exact:true}).click();
      await shot("groups-open");
      await page.getByRole("checkbox", {name:"Codex Team",exact:true}).check();
      await shot("groups-selected");
      await page.getByRole("checkbox", {name:"Codex Team 3",exact:true}).check();
      await shot("groups-scrolled");
      await page.keyboard.press("Escape");
      await editor.getByRole("button", {name:"下一步",exact:true}).click();
      await shot("oauth");
      await expect(editor.getByRole("button", {name:"生成授权链接",exact:true})).toBeDisabled();
      await expect(editor.getByRole("button", {name:"完成授权",exact:true})).toBeDisabled();
      await expect(editor.locator('textarea')).toHaveCount(0);
      await expect(editor.getByRole("spinbutton")).toHaveCount(0);
      for (const mode of ["API Key","Access Token","Refresh Token","账号文件"]) {
        await editor.getByRole("tab", {name:mode,exact:true}).click();
        await shot(mode === 'API Key' ? 'api-key' : mode === '账号文件' ? 'file' : mode.replace(' ', '-'));
        await expect(editor.getByRole("button", {name:"导入账号",exact:true})).toBeDisabled();
      }
      await editor.getByRole("tab", {name:"API Key",exact:true}).click();
      await expect(editor.locator("#account-api-key")).toBeDisabled();
      await editor.getByRole("textbox", {name:"账号名称",exact:true}).fill("Preview Tester");
      await editor.getByRole("textbox", {name:"Base URL",exact:true}).fill("https://api.example.com/v1");
      await editor.getByRole("combobox", {name:"传输方式",exact:true}).click();
      await shot("transport-menu");
      await page.getByRole("option", {name:"WS 优先",exact:true}).click();
      await shot("api-configured");
      await editor.getByRole("button", {name:"上一步",exact:true}).click();
      await expect(editor.getByRole("spinbutton", {name:"并发上限",exact:true})).toHaveValue("16");
      await expect(editor.getByRole("button", {name:"分组",exact:true})).toHaveText("已选 2 个");
      await shot("settings-return");
      await editor.getByRole("button", {name:"下一步",exact:true}).click();
      await expect(editor.getByRole("textbox", {name:"账号名称",exact:true})).toHaveValue("Preview Tester");
      await page.keyboard.press("Escape");
      await shot("discard");
      await page.getByRole("alertdialog").getByRole("button", {name:"放弃修改",exact:true}).click();
      await expect(editor).not.toBeVisible();
      await expect(page.getByText("Preview Tester", {exact:true})).toHaveCount(0);
      await page.getByRole("button", {name:"更多操作 Bob",exact:true}).filter({visible:true}).click();
      await page.getByRole("menuitem", {name:"编辑账号",exact:true}).click();
      editor = page.getByRole("dialog", { name: /编辑账号/ });
      await expect(editor.getByText("bob@example.com",{exact:true})).toBeVisible();
      await expect(editor.getByRole("textbox",{name:"邮箱",exact:true})).toHaveCount(0);
      await shot("edit");
      await editor.getByRole("textbox",{name:"账号名称",exact:true}).fill("");
      await editor.getByRole("button",{name:"保存",exact:true}).click();
      await expect(editor.getByRole("textbox",{name:"账号名称",exact:true})).toHaveAttribute("aria-invalid","true");
      await shot("validation");
      await editor.getByRole("textbox",{name:"账号名称",exact:true}).fill("Preview Updated");
      await editor.getByRole("spinbutton",{name:"并发上限",exact:true}).fill("16");
      await editor.getByRole("checkbox",{name:"OpenAI Standard",exact:true}).check();
      await editor.getByRole("button",{name:"保存",exact:true}).click();
      await expect(editor).not.toBeVisible();
      await shot("edited");
      await page.getByRole("button", {name:"更多操作 Preview Updated",exact:true}).filter({visible:true}).click();
      await page.getByRole("menuitem",{name:"停用（本地预览）",exact:true}).click();
      await shot("disabled");
      await page.getByRole("button", {name:"更多操作 Preview Updated",exact:true}).filter({visible:true}).click();
      await page.getByRole("menuitem",{name:"删除账号",exact:true}).click();
      await shot("delete");
      await page.getByRole("alertdialog").getByRole("button",{name:"删除预览账号",exact:true}).click();
      await expect(page.getByText("Preview Updated",{exact:true})).toHaveCount(0);
      await page.getByRole("button", { name: "添加账号", exact: true }).click();
      editor = page.getByRole("dialog", { name: /添加账号/ });
      await editor.getByRole("combobox", { name: "厂商", exact: true }).click();
      await page.getByRole("option", { name: "xAI", exact: true }).click();
      await editor.getByRole("button", {name:"分组",exact:true}).click();
      await expect(page.getByRole("checkbox", {name:"OpenAI Standard",exact:true})).toHaveCount(0);
      await expect(page.getByRole("checkbox", {name:"Grok API",exact:true})).toBeVisible();
      await shot("xai-groups");
      await page.keyboard.press("Escape");
      await editor.getByRole("button", {name:"下一步",exact:true}).click();
      await expect(editor.getByRole("tab")).toHaveCount(2);
      await expect(editor.getByRole("tab", {name:"API Key",exact:true})).toHaveCount(0);
      await expect.poll(() => editor.evaluate(el => el.scrollTop)).toBe(0);
      await expect(editor.locator('[data-slot="dialog-header"]')).toBeInViewport({ratio:1});
      await expect(editor.locator('[data-slot="dialog-footer"]')).toBeInViewport({ratio:1});
      await shot("xai-oauth");
      await page.keyboard.press("Escape");
      await shot("discard");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "放弃修改", exact: true })
        .click();
      await expect(editor).not.toBeVisible();
      if (mobile) {
        await page
          .getByRole("button", { name: "打开导航" })
          .count()
          .then(async (count) => {
            if (count) {
              await page.getByRole("button", { name: "打开导航" }).click();
              await shot("navigation");
              await page.keyboard.press("Escape");
            }
          });
      }
      const authorizeTrigger = page.getByRole("button", {name:"更多操作 Alice",exact:true}).filter({visible:true});
      await authorizeTrigger.click();
      await page.getByRole("menuitem",{name:"账号授权",exact:true}).click();
      const authorization = page.getByRole("dialog",{name:/账号授权/});
      await expect(authorization.getByText("alice@example.com",{exact:true})).toBeVisible();
      await expect(authorization.getByRole("textbox")).toHaveCount(0);
      await expect(authorization.getByRole("button",{name:"完成授权",exact:true})).toBeDisabled();
      await shot("authorize");
      await authorization.getByTestId("account-onboarding-body").evaluate(el=>el.scrollTop=el.scrollHeight);
      await shot("authorize-bottom");
      await page.keyboard.press("Escape");
      await expect(authorizeTrigger).toBeFocused();
      for (const name of ["用量详情", "个人信息", "额度预测", "额度重置"]) {
        const more = page
          .getByRole("button", { name: "更多操作 Alice", exact: true })
          .filter({ visible: true });
        await more.click();
        if (name === "用量详情") await shot("menu");
        await page.getByRole("menuitem", { name, exact: true }).click();
        const dialog = page.getByRole("dialog", { name: new RegExp(name) });
        await expect(dialog).toBeVisible();
        await shot(name);
        if (name === "个人信息") {
          await dialog.getByRole("tab", { name: "每周", exact: true }).click();
          await shot("profile-weekly");
          await dialog.getByRole("tab", { name: "累计", exact: true }).click();
          await shot("profile-cumulative");
        }
        if (name === "额度预测") {
          await dialog
            .getByRole("tab", { name: "月额度", exact: true })
            .click();
          await shot("forecast-month");
        }
        if (name === "额度重置")
          await expect(
            dialog.getByRole("button", { name: "使用重置" }).first(),
          ).toBeDisabled();
        await dialog
          .getByTestId("account-detail-body")
          .evaluate((el) => (el.scrollTop = el.scrollHeight));
        await shot(`${name}-bottom`);
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(more).toBeFocused();
      }
      await page
        .getByRole("button", { name: "查看用量 Alice", exact: true })
        .filter({ visible: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page
          .getByRole("button", { name: "查看用量 Alice", exact: true })
          .filter({ visible: true }),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "更多操作 Frank", exact: true })
        .filter({ visible: true })
        .click();
      await expect(
        page.getByRole("menuitem", { name: "额度重置", exact: true }),
      ).toBeDisabled();
      await shot("api-key-menu");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "下一页", exact: true }).click();
      await shot("pagination");
      await page
        .getByRole("textbox", { name: "搜索账号名称 / 邮箱…" })
        .fill("missing");
      await expect(
        page.getByText("暂无数据", { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await shot("empty");
      await page
        .getByRole("textbox", { name: "搜索账号名称 / 邮箱…" })
        .fill("");
      await page.getByRole("button", { name: "厂商", exact: true }).click();
      await shot("filter");
      await page.getByRole("option", { name: "xAI", exact: true }).click();
      await shot("filtered");
      expect(errors).toEqual([]);
      expect(writes).toEqual([]);
    });
  }
