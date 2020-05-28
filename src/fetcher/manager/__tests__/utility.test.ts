import { tagsMatch } from '../utility';
import { TagMatch } from '../../cache';

describe('utility-manager', () => {
  it('TagMatch.All must work', async () => {
   expect(tagsMatch(['tag1'], ['tag1', 'tag2'], TagMatch.All)).toBe(false);
   expect(tagsMatch(['tag1', 'tag2', 'tag3'], ['tag1', 'tag2'], TagMatch.All)).toBe(false);
  });

  it('TagMatch.Any must work', async () => {
    expect(tagsMatch(['tag1'], ['tag1', 'tag2'], TagMatch.Any)).toBe(true);
    expect(tagsMatch(['tag3'], ['tag1', 'tag2'], TagMatch.All)).toBe(false);
   });

   it('TagMatch.None must work', async () => {
    expect(tagsMatch(['tag1'], ['tag1', 'tag2'], TagMatch.None)).toBe(false);
    expect(tagsMatch(['tag3'], ['tag1', 'tag2'], TagMatch.None)).toBe(true);
   });

   it('tagsMatch should be ok with undefined tags', async () => {
    expect(tagsMatch(undefined, ['tag1', 'tag2'], TagMatch.All)).toBe(false);
    expect(tagsMatch(undefined, ['tag1', 'tag2'], TagMatch.None)).toBe(false);
    expect(tagsMatch(undefined, ['tag1', 'tag2'], TagMatch.Any)).toBe(false);
   });
});
