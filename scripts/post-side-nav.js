'use strict';

/**
 * 文章「上一篇 / 下一篇」的邻居计算。
 *
 * 为什么不直接用 Hexo 的 page.prev / page.next：
 *   1. 方向反了。Hexo 的 prev 指向**更新**的一篇，读者说的「上一篇」
 *      是前一篇（序号更小、更早）。
 *   2. 同日发布的文章顺序不稳定。DSP 十五篇大半是 10-15 同一天发的，
 *      按日期排出来是 四、六、五、七 —— 中间会跳号，读者点到（七）再点
 *      「下一篇」会跳到（五）。
 *
 * 所以这里复用 column-order.js 的序号解析：同一专栏内按**标题序号**排队，
 * 左箭头永远是序号 -1，右箭头永远是序号 +1，整条链 1→2→…→15 严丝合缝。
 * 没有分类的文章退回时间线（左 = 更早，右 = 更晚）。
 *
 * 悬浮箭头（_partials/post-side-nav.ejs）和文末翻页卡片共用这一个助手，
 * 两处的指向不会打架。
 */

const { ordinalOf, compareRows } = require('./column-order');

/** 跳过 hide: true 的文章，一路走到真正的邻居 */
function skipHidden(post, dir) {
  let p = post;
  let guard = 0;
  while (p && p.hide && guard++ < 100) {
    p = p[dir];
  }
  return p || null;
}

hexo.extend.helper.register('postSideNav', function postSideNav(page) {
  const result = { prev: null, next: null, fromColumn: false };
  if (!page) return result;

  /* 选篇数最多的那个分类当「当前专栏」 */
  let columnPosts = null;
  let columnIndex = -1;
  try {
    page.categories.each(function (cat) {
      const arr = cat.posts && cat.posts.toArray ? cat.posts.toArray() : [];
      if (arr.length > 1 && arr.length > columnIndex) {
        columnPosts = arr;
        columnIndex = arr.length;
      }
    });
  } catch (e) {
    columnPosts = null;
  }

  if (columnPosts) {
    const list = columnPosts
      .map(function (post) {
        return { post: post, ord: ordinalOf(post) };
      })
      .sort(compareRows)
      .filter(function (row) {
        return !row.post.hide;
      });

    const i = list.findIndex(function (row) {
      return row.post._id === page._id || row.post.path === page.path;
    });

    if (i >= 0) {
      result.prev = i > 0 ? list[i - 1].post : null;
      result.next = i < list.length - 1 ? list[i + 1].post : null;
      result.fromColumn = true;
      return result;
    }
  }

  /* 时间线兜底：page.next 是更早的一篇，page.prev 是更新的一篇 */
  result.prev = skipHidden(page.next, 'next');
  result.next = skipHidden(page.prev, 'prev');
  return result;
});
