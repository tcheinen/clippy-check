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
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const github = __importStar(require("@actions/github"));
const input = __importStar(require("./input"));
const check_1 = require("./check");
const result_1 = require("./result");
async function version(cmd, args) {
    args = args === undefined ? ['-V'] : [...args, '-V'];
    return (await exec.getExecOutput(cmd, args, { silent: true })).stdout;
}
function prefix(prefix, options) {
    return options.flatMap(opt => [
        prefix,
        opt === 'warnings' ? opt : opt.startsWith('clippy::') ? opt : 'clippy::' + opt,
    ]);
}
async function run(actionInput) {
    const startedAt = new Date().toISOString();
    let rustcVersion = await version('rustc');
    let cargoVersion = await version('cargo');
    let clippyVersion = await version('cargo', ['clippy']);
    const warn = prefix('--warn', actionInput.warn);
    const allow = prefix('--allow', actionInput.allow);
    const deny = prefix('--deny', actionInput.deny);
    const forbid = prefix('--forbid', actionInput.forbid);
    let runner = new check_1.CheckRunner();
    let stdErr = '';
    let clippyExitCode = 0;
    try {
        core.startGroup('Executing cargo fmt (JSON output)');
        const execOutput = await exec.getExecOutput('cargo', [
            'clippy',
            '--message-format=json',
            ...actionInput.options.filter(opt => !opt.startsWith('--message-format')),
            '--',
            ...warn,
            ...allow,
            ...deny,
            ...forbid,
        ], {
            ignoreReturnCode: true,
            failOnStdErr: false,
            listeners: {
                stdline: (line) => {
                    runner.tryPush(line);
                },
            },
        });
        stdErr = execOutput.stderr;
        clippyExitCode = execOutput.exitCode;
    }
    finally {
        core.endGroup();
    }
    let sha = github.context.sha;
    const pr = github.context.payload.pull_request;
    if (pr !== undefined && 'head' in pr) {
        sha = pr.head.sha;
    }
    await runner.executeCheck({
        token: actionInput.token,
        name: actionInput.name,
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        head_sha: sha,
        started_at: startedAt,
        context: {
            rustc: rustcVersion,
            cargo: cargoVersion,
            clippy: clippyVersion,
        },
    });
    if (clippyExitCode !== 0) {
        if (stdErr
            .split('\n')
            .map(line => line.startsWith('error: internal compiler error'))
            .reduce((acc, ice) => acc || ice, false)) {
            core.setOutput('Suppress ICEs', stdErr);
            return new result_1.Ok(undefined);
        }
        return new result_1.Err(`Clippy had exited with the ${clippyExitCode} exit code:\n${stdErr}`);
    }
    return new result_1.Ok(undefined);
}
exports.run = run;
async function main() {
    const actionInput = input.get();
    const res = await run(actionInput);
    if (res.type === 'failure')
        core.setFailed(`${res.unwrap_err()}`);
}
main();
