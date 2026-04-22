import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  duration?: number;
  formatter?: (value: number) => string;
}

export const AnimatedNumber = ({ 
  value, 
  className = '', 
  duration = 600,
  formatter = (val) => val.toString()
}: AnimatedNumberProps) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (displayValue !== value) {
      setIsAnimating(true);
      
      const startValue = displayValue;
      const endValue = value;
      const startTime = Date.now();
      
      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        
        const currentValue = Math.round(startValue + (endValue - startValue) * easedProgress);
        setDisplayValue(currentValue);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };
      
      requestAnimationFrame(animate);
    }
  }, [value, displayValue, duration]);

  return (
    <span 
      className={`transition-all duration-300 ${isAnimating ? 'scale-105' : 'scale-100'} ${className}`}
      style={{
        filter: isAnimating ? 'brightness(1.1)' : 'brightness(1)'
      }}
    >
      {formatter(displayValue)}
    </span>
  );
};
