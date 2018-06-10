/**
hexo.extend.generator.register('tags', function(locals){
    return {
      path: 'tags/index.html',
      data: locals.posts,
      layout: ['tags', 'index']
    }
  });
*/
hexo.extend.generator.register('archives', function(locals){
    return {
      path: 'archives/index.html',
      data: locals.posts,
      layout: ['categories', 'index']
    }
  });