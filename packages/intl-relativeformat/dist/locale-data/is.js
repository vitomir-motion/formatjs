IntlRelativeFormat.__addLocaleData({"locale":"is","pluralRuleFunction":function (n) {var i=Math.floor(Math.abs(n)),t=parseInt(n.toString().replace(/^[^.]*\.?|0+$/g,""),10);n=Math.floor(n);if(t===0&&i%10===1&&((i%100!==11)||(t!==0)))return"one";return"other";},"fields":{"second":{"displayName":"sekúnda","relative":{"0":"núna"},"relativeTime":{"future":{"one":"eftir {0} sekúndu","other":"eftir {0} sekúndur"},"past":{"one":"fyrir {0} sekúndu","other":"fyrir {0} sekúndum"}}},"minute":{"displayName":"mínúta","relativeTime":{"future":{"one":"eftir {0} mínútu","other":"eftir {0} mínútur"},"past":{"one":"fyrir {0} mínútu","other":"fyrir {0} mínútum"}}},"hour":{"displayName":"klukkustund","relativeTime":{"future":{"one":"eftir {0} klukkustund","other":"eftir {0} klukkustundir"},"past":{"one":"fyrir {0} klukkustund","other":"fyrir {0} klukkustundum"}}},"day":{"displayName":"dagur","relative":{"0":"í dag","1":"á morgun","2":"eftir tvo daga","-2":"í fyrradag","-1":"í gær"},"relativeTime":{"future":{"one":"eftir {0} dag","other":"eftir {0} daga"},"past":{"one":"fyrir {0} degi","other":"fyrir {0} dögum"}}},"month":{"displayName":"mánuður","relative":{"0":"í þessum mánuði","1":"í næsta mánuði","-1":"í síðasta mánuði"},"relativeTime":{"future":{"one":"eftir {0} mánuð","other":"eftir {0} mánuði"},"past":{"one":"fyrir {0} mánuði","other":"fyrir {0} mánuðum"}}},"year":{"displayName":"ár","relative":{"0":"á þessu ári","1":"á næsta ári","-1":"á síðasta ári"},"relativeTime":{"future":{"one":"eftir {0} ár","other":"eftir {0} ár"},"past":{"one":"fyrir {0} ári","other":"fyrir {0} árum"}}}}});