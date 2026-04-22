import * as React from "react";
import { Button, ButtonProps } from "./button";
import { cn } from "@/lib/utils";

interface InteractiveButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const InteractiveButton = React.forwardRef<HTMLButtonElement, InteractiveButtonProps>(
  ({ className, loading = false, loadingText, icon, children, disabled, ...props }, ref) => {
    return (
      <Button
        className={cn(
          "relative",
          loading && "btn-loading",
          className
        )}
        disabled={disabled || loading}
        ref={ref}
        {...props}
      >
        {!loading && icon && (
          <span className="mr-2">{icon}</span>
        )}
        <span className={cn("btn-text", loading && "opacity-0")}>
          {loading && loadingText ? loadingText : children}
        </span>
      </Button>
    );
  }
);

InteractiveButton.displayName = "InteractiveButton";
