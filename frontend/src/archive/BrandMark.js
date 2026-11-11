import React from "react";
import { Link } from "react-router-dom";

export default function BrandMark({ className = "" }) {
  return (
    <Link to="/" className={`bh-brand ${className}`.trim()}>
      <span className="bh-brand-en">Bay&#257;z-e-Hay&#257;t</span>
      <span className="bh-brand-ur" lang="ur" dir="rtl" aria-hidden="true">بیاضِ حیات</span>
    </Link>);

}
