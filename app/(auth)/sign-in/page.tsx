"use client";
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import Image from 'next/image'
import React from 'react'

const SignInPage = () => {
  return (
    <section className='flex flex-col items-center justify-center min-h-screen bg-background px-4 py-16 md:py-32'>
        <div className="flex flex-row justify-center items-center gap-x-2">
        <h1 className="text-3xl font-extrabold text-foreground ">Welcome to</h1>
        <span className='text-3xl font-extrabold text-foreground'>Devchat<span className='text-3xl text-primary'>AI</span></span>
      </div>
      <p className="mt-2 text-lg text-muted-foreground font-semibold">
        Sign in below (or use your Google or Github account)
      </p>

      <Button
      variant={"default"}
       className={
          "max-w-sm mt-5 w-full px-5 py-6 flex flex-row justify-center items-center cursor-pointer"
        }
        onClick={()=>authClient.signIn.social({
            provider:"github",
            callbackURL:"/"
        })}
      >
          <Image src={"/github.svg"} alt={"github"} width={24} height={24} />
        <span className="font-bold ml-2">Sign in with Github</span>
      </Button>
            <Button
        variant={"secondary"}
        className={
          "max-w-sm mt-5 w-full px-5 py-6 flex flex-row justify-center items-center cursor-pointer"
        }
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
          })
        }
      >
        <Image
          src={"/icons8-google.svg"}
          alt={"github"}
          width={24}
          height={24}
        />
        <span className="font-bold ml-2">Sign in with Google</span>
      </Button>
    </section>
  )
}

export default SignInPage