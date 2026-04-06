import { useEffect, useState } from 'react';
import { useGetStartupConfig } from '~/data-provider';

interface PaddleWindow extends Window {
  Paddle?: {
    Environment: {
      set: (env: 'sandbox' | 'production') => void;
    };
    Initialize: (config: { token: string; eventCallback?: (data: any) => void }) => void;
    Checkout: {
      open: (config: {
        transactionId?: string;
        settings?: {
          displayMode?: 'overlay' | 'inline';
          theme?: 'light' | 'dark';
          locale?: string;
        };
        eventCallback?: (data: any) => void;
      }) => void;
    };
    Overlay: {
      close: () => void;
    };
  };
}

/**
 * Hook to initialize and manage Paddle.js
 * Based on official Paddle documentation: https://developer.paddle.com/build/tools/sandbox
 */
export default function usePaddle() {
  const { data: startupConfig } = useGetStartupConfig();
  const [isReady, setIsReady] = useState(false);
  const [paddleInstance, setPaddleInstance] = useState<typeof window.Paddle | undefined>(undefined);

  useEffect(() => {
    const paddleWindow = window as unknown as PaddleWindow;
    
    // Wait for Paddle.js to load
    if (!paddleWindow.Paddle) {
      // Check if script is still loading
      const checkPaddle = setInterval(() => {
        if (paddleWindow.Paddle) {
          clearInterval(checkPaddle);
          initializePaddle();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkPaddle);
        if (!paddleWindow.Paddle) {
          console.error('[Paddle] Paddle.js failed to load after 10 seconds');
        }
      }, 10000);

      return () => clearInterval(checkPaddle);
    } else {
      initializePaddle();
    }

    function initializePaddle() {
      if (!paddleWindow.Paddle) {
        return;
      }

      const paddleClientToken = (startupConfig as any)?.paddleClientToken;
      const paddleEnvironment = (startupConfig as any)?.paddleEnvironment || 'sandbox';

      if (!paddleClientToken) {
        console.warn('[Paddle] Client token not configured');
        return;
      }

      try {
        // Set environment BEFORE initializing (required per docs)
        // Sandbox tokens are prefixed with 'test_', but we also check env var
        const isSandbox = 
          paddleEnvironment === 'sandbox' || 
          paddleClientToken.startsWith('test_');

        if (isSandbox) {
          paddleWindow.Paddle.Environment.set('sandbox');
        } else {
          paddleWindow.Paddle.Environment.set('production');
        }

        // Initialize Paddle.js
        paddleWindow.Paddle.Initialize({
          token: paddleClientToken,
          eventCallback: (data: any) => {
            // Handle global Paddle events if needed
            if (data.name === 'checkout.completed') {
              console.log('[Paddle] Checkout completed:', data);
            }
          },
        });

        setPaddleInstance(paddleWindow.Paddle);
        setIsReady(true);
        console.log('[Paddle] Initialized successfully', { environment: isSandbox ? 'sandbox' : 'production' });
      } catch (error) {
        console.error('[Paddle] Initialization error:', error);
      }
    }
  }, [startupConfig]);

  return {
    isReady,
    Paddle: paddleInstance,
  };
}

