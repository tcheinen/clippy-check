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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const string_argv_1 = __importDefault(require("string-argv"));
const core = __importStar(require("@actions/core"));
function get() {
    const token = core.getInput('token', { required: true });
    const options = string_argv_1.default(core.getInput('options', { required: false }));
    const warn = string_argv_1.default(core.getInput('warn', { required: false }));
    const allow = string_argv_1.default(core.getInput('allow', { required: false }));
    const deny = string_argv_1.default(core.getInput('deny', { required: false }));
    const forbid = string_argv_1.default(core.getInput('forbid', { required: false }));
    const name = core.getInput('name', { required: false });
    return {
        token,
        options,
        warn,
        allow,
        deny,
        forbid,
        name,
    };
}
exports.get = get;
