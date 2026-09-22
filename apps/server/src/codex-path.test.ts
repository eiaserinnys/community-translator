import { describe, expect, it } from "vitest";

import { candidateCodexCliPaths, resolveCodexCliPath } from "./codex-path.js";

describe("candidateCodexCliPaths", () => {
  it("prefers PATH entries on linux", () => {
    expect(candidateCodexCliPaths({ PATH: "/usr/local/bin:/usr/bin" }, "linux")).toEqual([
      { path: "/usr/local/bin/codex", source: "PATH" },
      { path: "/usr/bin/codex", source: "PATH" },
    ]);
  });

  it("adds the nvm-style home fallbacks on linux", () => {
    const candidates = candidateCodexCliPaths({ HOME: "/home/eias" }, "linux");
    expect(candidates.map((candidate) => candidate.path)).toEqual([
      "/home/eias/.npm-global/bin/codex",
      "/home/eias/.local/bin/codex",
    ]);
  });

  it("expands the spawnable windows extensions and the npm global directory", () => {
    const candidates = candidateCodexCliPaths(
      { APPDATA: "C:\\Users\\LG\\AppData\\Roaming", Path: "C:\\tools" },
      "win32",
    );
    expect(candidates.map((candidate) => candidate.path)).toEqual([
      "C:\\tools\\codex.cmd",
      "C:\\tools\\codex.exe",
      "C:\\tools\\codex.bat",
      "C:\\tools\\codex.com",
      "C:\\Users\\LG\\AppData\\Roaming\\npm\\codex.cmd",
      "C:\\Users\\LG\\AppData\\Roaming\\npm\\codex.exe",
      "C:\\Users\\LG\\AppData\\Roaming\\npm\\codex.bat",
      "C:\\Users\\LG\\AppData\\Roaming\\npm\\codex.com",
    ]);
  });
});

describe("resolveCodexCliPath", () => {
  it("honours an explicit override without touching the filesystem", () => {
    expect(resolveCodexCliPath({ CODEX_CLI_PATH: "  /opt/codex  " }, "linux")).toEqual({
      path: "/opt/codex",
      source: "CODEX_CLI_PATH",
    });
  });

  it("returns undefined when nothing is spawnable", () => {
    expect(resolveCodexCliPath({ PATH: "/definitely/not/here" }, "linux")).toBeUndefined();
  });
});
