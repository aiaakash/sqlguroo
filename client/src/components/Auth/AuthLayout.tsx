import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a className="font-semibold text-primary hover:underline" href="/forgot-password">
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="relative flex min-h-screen flex-col bg-background"
    >
      <Banner />
      <BlinkAnimation active={isFetching}>
        <div className="mt-6 flex h-20 w-full items-center justify-center bg-cover">
          <img
            src="/assets/sqlguroo_256x256.png"
            className="h-full w-auto object-contain"
            alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'SQL Guroo' })}
          />
        </div>
      </BlinkAnimation>
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center px-4">
        <div className="w-full max-w-full overflow-hidden rounded-lg border border-border-light bg-card px-4 py-4 shadow-sm sm:max-w-md sm:px-6">
          {!hasStartupConfigError && !isFetching && header && (
            <>
              {pathname.includes('login') && (
                <h1
                  className="mb-8 text-center text-3xl font-bold tracking-tighter text-foreground"
                  style={{
                    fontWeight: 300,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  SQL Guroo
                </h1>
              )}
              <h1
                className="mb-4 text-center text-2xl font-semibold text-foreground"
                style={{ userSelect: 'none', fontFamily: 'var(--font-sans)' }}
              >
                {header}
              </h1>
            </>
          )}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
          {children}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
