# feat: say days, hours and minutes in the reset countdown (#2963)

`resetsIn` read a week's reset as hours alone ("52h 10m"). From one day up it now says days, hours and minutes.

- One shared function feeds the toolbar gauge hover, the Token usage screen and the account mark menu, so all three change together; there is no second formatter to keep in step.
- Under a day the wording is unchanged. At a day or more all three units are shown, zeros included, so the reading never silently drops a unit.
- A new `resetsInDays` key in each of the five tip dictionaries.
