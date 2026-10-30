import { Modal, Notice } from "obsidian";
import { visibleTemplates } from "../core/scope";
import { errorMessage, getActiveContext, type Host } from "./host";

class ScopeModal extends Modal {
	constructor(
		private readonly host: Host,
		private readonly folder: string,
		private readonly visible: ReturnType<typeof visibleTemplates>,
		private readonly invalid: { path: string; error: string }[],
	) {
		super(host.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: this.folder === "" ? "/" : this.folder });

		if (this.visible.length > 0) {
			const list = contentEl.createEl("ul");
			for (const { template, captures } of this.visible) {
				const item = list.createEl("li");
				item.createEl("strong", { text: template.label });
				const values = Object.entries(captures).map(([name, value]) => `${name}=${value}`);
				item.createEl("div", { text: [template.path, ...values].join("  ") });
			}
		}
		if (this.invalid.length > 0) {
			contentEl.createEl("h4", { text: "Invalid" });
			const list = contentEl.createEl("ul");
			for (const { path, error } of this.invalid) {
				const item = list.createEl("li");
				item.createEl("div", { text: path });
				item.createEl("div", { text: error });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export async function runShowScope(host: Host): Promise<void> {
	try {
		const context = getActiveContext(host.app);
		const { valid, invalid } = await host.index.load();
		const visible = visibleTemplates(
			valid.map((entry) => entry.scope),
			context.folder,
			host.settings.folderName,
			host.settings.mru,
		);
		new ScopeModal(host, context.folder, visible, invalid).open();
	} catch (error) {
		new Notice(errorMessage(error));
	}
}
