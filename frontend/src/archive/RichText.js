import React from "react";

const INLINE = { STRONG: "strong", B: "strong", EM: "em", I: "em" };

function render(node, key) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return null;

  const children = Array.from(node.childNodes).map((c, i) => render(c, i));
  const tag = INLINE[node.tagName];

  if (tag) return React.createElement(tag, { key }, children);
  if (node.tagName === "BR") return <br key={key} />;
  if (node.tagName === "A") return <span key={key}>{children}</span>;
  if (node.tagName === "P") return <p key={key}>{children}</p>;
  return <React.Fragment key={key}>{children}</React.Fragment>;
}

export default function RichText({ html, className, dir }) {
  if (!html) return null;

  if (!/[<&]/.test(html)) {
    return (
      <div className={className} dir={dir}>
        {html}
      </div>
    );
  }

  let body;
  try {
    body = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstChild;
  } catch (err) {
    return (
      <div className={className} dir={dir}>
        {html}
      </div>
    );
  }

  return (
    <div className={className} dir={dir}>
      {Array.from(body.childNodes).map((c, i) => render(c, i))}
    </div>
  );
}
