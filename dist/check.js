"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckRunner = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const pkg = require('../package.json');
const render_1 = require("./render");
const USER_AGENT = `${pkg.name}/${pkg.version} (${pkg.bugs.url})`;
class CheckRunner {
    constructor() {
        this.annotations = [];
        this.stats = {
            ice: 0,
            error: 0,
            warning: 0,
            note: 0,
            help: 0,
        };
    }
    tryPush(line) {
        let contents;
        try {
            contents = JSON.parse(line);
        }
        catch (error) {
            core.debug('Not a JSON, ignoring it');
            return;
        }
        if (contents.reason != 'compiler-message') {
            core.debug(`Unexpected reason field, ignoring it: ${contents.reason}`);
            return;
        }
        if (contents.message.code === null) {
            core.debug('Message code is missing, ignoring it');
            return;
        }
        switch (contents.message.level) {
            case 'help':
                this.stats.help += 1;
                break;
            case 'note':
                this.stats.note += 1;
                break;
            case 'warning':
                this.stats.warning += 1;
                break;
            case 'error':
                this.stats.error += 1;
                break;
            case 'error: internal compiler error':
                this.stats.ice += 1;
                break;
            default:
                break;
        }
        this.annotations.push(CheckRunner.makeAnnotation(contents));
    }
    async executeCheck(options) {
        core.info(`Clippy results: \
${this.stats.ice} ICE, ${this.stats.error} errors, \
${this.stats.warning} warnings, ${this.stats.note} notes, \
${this.stats.help} help`);
        const client = github.getOctokit(options.token, {
            userAgent: USER_AGENT,
        });
        let checkRunId;
        try {
            checkRunId = await this.createCheck(client, options);
        }
        catch (error) {
            if (process.env.GITHUB_HEAD_REF) {
                core.error(`Unable to create clippy annotations! Reason: ${error}`);
                core.warning('It seems that this Action is executed from the forked repository.');
                core.warning(`GitHub Actions are not allowed to create Check annotations, \
when executed for a forked repos. \
See https://github.com/actions-rs/clippy-check/issues/2 for details.`);
                core.info('Posting clippy checks here instead.');
                this.dumpToStdout();
                if (this.getConclusion() == 'failure') {
                    throw new Error('Exiting due to clippy errors');
                }
                else {
                    return;
                }
            }
            else {
                throw error;
            }
        }
        try {
            if (this.isSuccessCheck()) {
                await this.successCheck(client, checkRunId, options);
            }
            else {
                await this.runUpdateCheck(client, checkRunId, options);
            }
        }
        catch (error) {
            await this.cancelCheck(client, checkRunId, options);
            throw error;
        }
    }
    async createCheck(client, options) {
        const response = await client.rest.checks.create({
            owner: options.owner,
            repo: options.repo,
            name: options.name,
            head_sha: options.head_sha,
            status: 'in_progress',
        });
        return response.data.id;
    }
    async runUpdateCheck(client, checkRunId, options) {
        let annotations = this.getBucket();
        while (annotations.length > 0) {
            let req = {
                owner: options.owner,
                repo: options.repo,
                name: options.name,
                check_run_id: checkRunId,
                output: {
                    title: options.name,
                    summary: this.getSummary(),
                    text: this.getText(options.context),
                    annotations: annotations,
                },
            };
            if (this.annotations.length > 0) {
                core.debug('This is not the last iteration, marking check as "in_progress"');
                req.status = 'in_progress';
            }
            else {
                const conclusion = this.getConclusion();
                core.debug(`This is a last iteration, marking check as "completed", conclusion: ${conclusion}`);
                req.status = 'completed';
                req.conclusion = conclusion;
                req.completed_at = new Date().toISOString();
            }
            await client.rest.checks.update(req);
            annotations = this.getBucket();
        }
        return;
    }
    async successCheck(client, checkRunId, options) {
        let req = {
            owner: options.owner,
            repo: options.repo,
            name: options.name,
            check_run_id: checkRunId,
            status: 'completed',
            conclusion: this.getConclusion(),
            completed_at: new Date().toISOString(),
            output: {
                title: options.name,
                summary: this.getSummary(),
                text: this.getText(options.context),
            },
        };
        await client.rest.checks.update(req);
        return;
    }
    async cancelCheck(client, checkRunId, options) {
        let req = {
            owner: options.owner,
            repo: options.repo,
            name: options.name,
            check_run_id: checkRunId,
            status: 'completed',
            conclusion: 'cancelled',
            completed_at: new Date().toISOString(),
            output: {
                title: options.name,
                summary: 'Unhandled error',
                text: 'Check was cancelled due to unhandled error. Check the Action logs for details.',
            },
        };
        await client.rest.checks.update(req);
        return;
    }
    dumpToStdout() {
        for (const annotation of this.annotations) {
            core.info(annotation.message);
        }
    }
    getBucket() {
        let annotations = [];
        while (annotations.length < 50) {
            const annotation = this.annotations.pop();
            if (annotation) {
                annotations.push(annotation);
            }
            else {
                break;
            }
        }
        core.debug(`Prepared next annotations bucket, ${annotations.length} size`);
        return annotations;
    }
    getSummary() {
        let blocks = [];
        if (this.stats.ice > 0) {
            blocks.push(`${this.stats.ice} internal compiler error${render_1.plural(this.stats.ice)}`);
        }
        if (this.stats.error > 0) {
            blocks.push(`${this.stats.error} error${render_1.plural(this.stats.error)}`);
        }
        if (this.stats.warning > 0) {
            blocks.push(`${this.stats.warning} warning${render_1.plural(this.stats.warning)}`);
        }
        if (this.stats.note > 0) {
            blocks.push(`${this.stats.note} note${render_1.plural(this.stats.note)}`);
        }
        if (this.stats.help > 0) {
            blocks.push(`${this.stats.help} help message${render_1.plural(this.stats.help)}`);
        }
        return blocks.join(', ');
    }
    getText(context) {
        return `## Results
| Message level           | Amount                |
| ----------------------- | --------------------- |
| Internal compiler error | ${this.stats.ice}     |
| Error                   | ${this.stats.error}   |
| Warning                 | ${this.stats.warning} |
| Note                    | ${this.stats.note}    |
| Help                    | ${this.stats.help}    |
## Versions
* ${context.rustc}
* ${context.cargo}
* ${context.clippy}
`;
    }
    getConclusion() {
        if (this.stats.ice > 0 || this.stats.error > 0) {
            return 'failure';
        }
        else {
            return 'success';
        }
    }
    isSuccessCheck() {
        return (this.stats.ice == 0 &&
            this.stats.error == 0 &&
            this.stats.warning == 0 &&
            this.stats.note == 0 &&
            this.stats.help == 0);
    }
    static makeAnnotation(contents) {
        const primarySpan = contents.message.spans.find(span => span.is_primary == true);
        if (null == primarySpan) {
            throw new Error('Unable to find primary span for message');
        }
        let annotation_level;
        switch (contents.message.level) {
            case 'help':
            case 'note':
                annotation_level = 'notice';
                break;
            case 'warning':
                annotation_level = 'warning';
                break;
            default:
                annotation_level = 'failure';
                break;
        }
        let annotation = {
            path: primarySpan.file_name,
            start_line: primarySpan.line_start,
            end_line: primarySpan.line_end,
            annotation_level: annotation_level,
            title: contents.message.message,
            message: contents.message.rendered,
        };
        if (primarySpan.line_start == primarySpan.line_end) {
            annotation.start_column = primarySpan.column_start;
            annotation.end_column = primarySpan.column_end;
        }
        return annotation;
    }
}
exports.CheckRunner = CheckRunner;
