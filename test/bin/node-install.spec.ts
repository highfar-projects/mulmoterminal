// @vitest-environment node
import { describe, it, expect } from "vitest";
import { nodeUpgradeGuide } from "../../bin/node-install.js";

const NO_ENV = {};

describe("nodeUpgradeGuide", () => {
  // process.execPath is the RESOLVED binary, so each case is the path Node reports, not the
  // symlink on PATH.
  it.each([
    ["nodebrew", "/Users/u/.nodebrew/node/v20.13.0/bin/node", ["nodebrew install stable", "nodebrew use stable"]],
    ["nvm", "/Users/u/.nvm/versions/node/v20.13.0/bin/node", ["nvm install --lts", "nvm alias default 'lts/*'"]],
    ["Volta", "/Users/u/.volta/tools/image/node/20.13.0/bin/node", ["volta install node"]],
    ["fnm", "/Users/u/.local/share/fnm/node-versions/v20.13.0/installation/bin/node", ["fnm install 24", "fnm default 24"]],
    ["mise", "/Users/u/.local/share/mise/installs/node/20.13.0/bin/node", ["mise use -g node@lts"]],
    ["asdf", "/Users/u/.asdf/installs/nodejs/20.13.0/bin/node", ["asdf install nodejs latest", "asdf set -u nodejs $(asdf latest nodejs)"]],
    ["Homebrew", "/opt/homebrew/Cellar/node/21.0.0/bin/node", ["brew upgrade node"]],
    ["Homebrew (node@20)", "/usr/local/Cellar/node@20/20.13.0/bin/node", ["brew unlink node@20", "brew install node"]],
    ["Homebrew (node@18)", "/home/linuxbrew/.linuxbrew/Cellar/node@18/18.20.0/bin/node", ["brew unlink node@18", "brew install node"]],
  ])("recognises %s", (via, execPath, commands) => {
    expect(nodeUpgradeGuide(execPath, "darwin", NO_ENV)).toEqual({ via, commands });
  });

  describe("macOS and Linux installs with no tool to run", () => {
    // The reporter's machine: the nodejs.org .pkg puts a real binary here, not a symlink.
    it("names the macOS installer for /usr/local/bin/node", () => {
      expect(nodeUpgradeGuide("/usr/local/bin/node", "darwin", NO_ENV)).toEqual({ via: "the macOS installer from nodejs.org", commands: [] });
    });

    it("names the system package manager for /usr/bin/node on Linux", () => {
      expect(nodeUpgradeGuide("/usr/bin/node", "linux", NO_ENV)).toEqual({ via: "your system's package manager", commands: [] });
    });

    it("claims nothing for a path it does not know", () => {
      expect(nodeUpgradeGuide("/opt/custom/node/bin/node", "linux", NO_ENV)).toEqual({ via: null, commands: [] });
      expect(nodeUpgradeGuide("/usr/bin/node", "darwin", NO_ENV)).toEqual({ via: null, commands: [] });
    });
  });

  describe("Windows", () => {
    const PROGRAM_FILES_NODE = "C:\\Program Files\\nodejs\\node.exe";

    it("names the installer for Program Files", () => {
      expect(nodeUpgradeGuide(PROGRAM_FILES_NODE, "win32", NO_ENV)).toEqual({ via: "the Windows installer", commands: [] });
    });

    // nvm-windows' symlink defaults to the installer's own directory, so the path alone would
    // send an nvm user to an installer that nvm then shadows.
    it("tells nvm-windows from the installer by its environment, ignoring case", () => {
      const env = { NVM_SYMLINK: "C:\\Program Files\\NodeJS", NVM_HOME: "C:\\Users\\u\\AppData\\Roaming\\nvm" };
      expect(nodeUpgradeGuide(PROGRAM_FILES_NODE, "win32", env)).toEqual({ via: "nvm-windows", commands: ["nvm install lts", "nvm use lts"] });
      expect(nodeUpgradeGuide("C:\\Users\\u\\AppData\\Roaming\\nvm\\v20.13.0\\node.exe", "win32", env).via).toBe("nvm-windows");
    });

    it("ignores an empty NVM_SYMLINK rather than matching every path", () => {
      expect(nodeUpgradeGuide(PROGRAM_FILES_NODE, "win32", { NVM_SYMLINK: "" }).via).toBe("the Windows installer");
    });

    it("updates the Scoop app the binary came from", () => {
      const execPath = "C:\\Users\\u\\scoop\\apps\\nodejs-lts\\20.13.0\\node.exe";
      expect(nodeUpgradeGuide(execPath, "win32", NO_ENV)).toEqual({ via: "Scoop", commands: ["scoop update nodejs-lts"] });
    });

    it("recognises Volta and fnm by their Windows paths", () => {
      expect(nodeUpgradeGuide("C:\\Users\\u\\AppData\\Local\\Volta\\tools\\image\\node\\20.13.0\\node.exe", "win32", NO_ENV).via).toBe("Volta");
      expect(nodeUpgradeGuide("C:\\Users\\u\\AppData\\Roaming\\fnm\\node-versions\\v20.13.0\\installation\\node.exe", "win32", NO_ENV).via).toBe("fnm");
    });
  });
});
