import { useEffect } from "react";

export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · SupportFlow` : "SupportFlow";
  }, [title]);
}
