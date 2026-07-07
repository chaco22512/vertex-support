import type { JSX } from 'preact';
import { CategoryIcon } from '../icons';
import type { LocalizedCategory } from '../data/menuLocalized';

export function CategoryGrid(props: {
  prompt: string;
  categories: LocalizedCategory[];
  lang: string;
  onSelect: (category: LocalizedCategory) => void;
}): JSX.Element {
  return (
    <div class="scroll">
      <p class="category__prompt" lang={props.lang}>
        {props.prompt}
      </p>
      <div class="tiles">
        {props.categories.map((c) => (
          <button key={c.id} class="tile" lang={props.lang} onClick={() => props.onSelect(c)}>
            <CategoryIcon name={c.icon} class="tile__icon" />
            <span class="tile__label">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
