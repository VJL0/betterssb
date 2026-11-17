/**
 * Banner 9's class search results grid as it renders the Instructor column
 * (structure taken from Temple's Browse Classes page; names are made up).
 */

function instructorCell(names: readonly string[]): string {
  const links = names
    .map(
      (name, i) =>
        `<a class="email" aria-haspopup="true" data-index="${i}" href="mailto:x${i}@example.edu" tabindex="-1">${name}</a>${i === 0 ? " (Primary)" : ""} <br>`,
    )
    .join("");
  return `<td data-property="instructor">${links}</td>`;
}

/** Results rows (`<tr>`), one per list of instructor names. */
export function bannerRowsHtml(rows: readonly (readonly string[])[]): string {
  return rows
    .map(
      (names) =>
        `<tr><td data-property="courseTitle">Data Structures</td>${instructorCell(names)}</tr>`,
    )
    .join("");
}

/** A results grid (`#table1`) holding these rows. */
export function bannerResultsHtml(
  rows: readonly (readonly string[])[],
): string {
  return `<div id="searchResultsTable"><table id="table1"><tbody>${bannerRowsHtml(rows)}</tbody></table></div>`;
}
