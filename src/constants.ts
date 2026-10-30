/** Every user-visible or file-format name lives here, so renaming is a one-file edit. */

export const CONFIG_PREFIX = "tpl-";

export const KEYS = {
	label: `${CONFIG_PREFIX}label`,
	where: `${CONFIG_PREFIX}where`,
	except: `${CONFIG_PREFIX}except`,
	into: `${CONFIG_PREFIX}into`,
	filename: `${CONFIG_PREFIX}filename`,
	open: `${CONFIG_PREFIX}open`,
	command: `${CONFIG_PREFIX}command`,
} as const;

export const KNOWN_KEYS: readonly string[] = Object.values(KEYS);

/** Variable names that cannot be used as capture names in `tpl-where`. */
export const RESERVED_VARS: readonly string[] = [
	"date",
	"time",
	"title",
	"selection",
	"source",
	"cursor",
	"from",
	"template",
	"here",
];

export const CURSOR_MARKER = "{{cursor}}";
/** Separates alternatives in a value: the first one that is not empty is used. */
export const OR_OPERATOR = "||";

/** Faint placeholders for empty config keys in the Properties editor. */
export const GHOST_WHERE_ROOT = "/";
export const GHOST_CLASS = "scoped-templates-ghost";
/** Set on a view that shows a template file; scopes the template-only styles. */
export const TEMPLATE_VIEW_CLASS = "scoped-templates-view";
/** Set on a property value that holds a `{{variable}}` instead of a literal value. */
export const VARIABLE_CLASS = "scoped-templates-var";
export const PANE_CLASS = "scoped-templates-pane";
/** Set on the first property of each group (template keys, note properties) in a template view. */
export const GROUP_START_CLASS = "scoped-templates-group-start";
export const GROUP_FIRST_CLASS = "scoped-templates-group-first";
export const GROUP_ATTRIBUTE = "data-scoped-group";
/** Caption of the scenario line in the definition panel. */
export const DETAIL_EXAMPLE_LABEL = "Example";
export const GROUP_LABELS = { keys: "Template keys", notes: "Note properties" } as const;
/** Set on the document body while a property name is pointed at; hides Obsidian's own tooltip. */
export const KEY_HELP_CLASS = "scoped-templates-key-help";

export const NEW_TEMPLATE_LABEL = "New template";
/** Last row of the template list: a plus marks it as an action, not a template name. */
export const NEW_TEMPLATE_ACTION_LABEL = `+ ${NEW_TEMPLATE_LABEL}`;
/** Set on the list row that starts a new block, so the rows above stay a separate group. */
export const SEPARATED_CLASS = "scoped-templates-separated";
export const NEW_TEMPLATE_CHOOSE_LABEL = "New template, choose keys…";
/** Most note properties the choice dialog lists. */
export const SKELETON_DIALOG_PROPERTY_LIMIT = 30;
export const EMPTY_BASE_LABEL = "Empty template";
/** In front of an existing template in the list of bases: choosing it makes a copy. */
export const COPY_BASE_PREFIX = "Copy of ";
/** Muted note on a template whose label is shared with another one: the folder it works in. */
export const AVAILABLE_EVERYWHERE_LABEL = "everywhere";
/** Rows of the list that asks where a new template will be used. */
export const USED_IN_PREFIX = "In ";
export const USED_IN_SUFFIX = " and the folders inside it";
export const USED_EVERYWHERE_LABEL = "Everywhere";
export const USED_WHERE_CAPTION = "Where will it be used?";
export const NEW_TEMPLATE_BASENAME = "Untitled";
/** Share of notes in a folder that must have a property for the new template to include it. */
export const SKELETON_KEY_THRESHOLD = 0.5;

export const COMMANDS = {
	create: { id: "create", name: "Create from template" },
	apply: { id: "apply", name: "Apply template" },
	showScope: { id: "show-scope", name: "Show templates here" },
	createPrefix: "create-",
	applyPrefix: "apply-",
	createLabel: "Create: ",
	applyLabel: "Apply: ",
} as const;

export interface PluginSettings {
	folderName: string;
	dateFormat: string;
	timeFormat: string;
	inheritFromNeighbors: boolean;
	/** Template keys that the "choose keys" dialog had checked last time. */
	templateKeys: string[];
	/** Note properties the user hid from the "choose keys" dialog and from new templates. */
	hiddenProperties: string[];
	/** Template path -> last used timestamp. */
	mru: Record<string, number>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	folderName: "_tpl",
	dateFormat: "YYYY-MM-DD",
	timeFormat: "HH:mm",
	inheritFromNeighbors: true,
	templateKeys: [...KNOWN_KEYS],
	hiddenProperties: [],
	mru: {},
};

export const DEFAULT_NAME_DATE_FORMAT = "YYMMDDHHmm";
/** What an empty `tpl-filename` and `tpl-into` mean, written as the values they would be. */
export const DEFAULT_FILENAME = `{{selection}} ${OR_OPERATOR} {{template}}-{{date:${DEFAULT_NAME_DATE_FORMAT}}}`;
export const DEFAULT_INTO = "{{here}}";
export const MAX_NAME_LENGTH = 200;

export const NOTICE_OPEN_NOTE_FIRST = "Open a note first";
export const NOTICE_INVALID_FRONTMATTER = "This note has invalid frontmatter";
export const NOTICE_NO_TEMPLATE_FOR_HOTKEY = "No template with this hotkey";
