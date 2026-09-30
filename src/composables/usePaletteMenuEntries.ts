// The palette's side of the Run and Skill menus' rows (#2697): read the acting terminal's scripts and
// skills while the palette is up, from the endpoints the menus read, and run a pick through the
// terminal's own paths.
import { computed, watch } from "vue";
import { useDirScripts, useDirSkills, type RunnableScript } from "./useDirLists";
import { scriptRunCommand } from "../components/runCommand";
import type { PaletteMenus } from "./paletteHeaderEntries";

export function usePaletteMenuEntries(menus: () => PaletteMenus | null) {
  const scriptList = useDirScripts();
  const skillList = useDirSkills();
  // A terminal without the menus reads as no directory, so it lists nothing; another directory's
  // rows go at once rather than standing under the new terminal while its lists are read.
  watch(
    () => menus()?.cwd ?? null,
    (dir) => {
      scriptList.forget();
      skillList.forget();
      void scriptList.load(dir);
      void skillList.load(dir);
    },
    { immediate: true },
  );
  // In the directory the list was read for, as the Run menu runs it.
  function runScript(script: RunnableScript): void {
    const target = menus();
    target?.runScript(scriptRunCommand(script, scriptList.value.value.cwd ?? target.cwd));
  }
  const runSkill = (slug: string): void => menus()?.runSkill(slug);
  return {
    scripts: computed(() => scriptList.value.value.scripts),
    skills: computed(() => skillList.value.value.skills),
    runScript,
    runSkill,
  };
}
