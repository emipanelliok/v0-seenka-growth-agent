import { createClient } from "@/lib/supabase/server"

export async function getPrompt(key: string): Promise<string | null> {
  const supabase = await createClient()

  // First try to get user-specific prompt
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    const { data: userPrompts } = await supabase
      .from("prompts")
      .select("prompt_text")
      .eq("user_id", user.id)
      .eq("key", key)
      .eq("is_active", true)
      .limit(1)

    if (userPrompts && userPrompts.length > 0) {
      return userPrompts[0].prompt_text
    }
  }

  // Fallback to global prompt (user_id is NULL)
  const { data: globalPrompts } = await supabase
    .from("prompts")
    .select("prompt_text")
    .is("user_id", null)
    .eq("key", key)
    .eq("is_active", true)
    .limit(1)

  if (!globalPrompts || globalPrompts.length === 0) {
    return null
  }

  return globalPrompts[0].prompt_text
}

export async function getAllPrompts() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Get both user-specific and global prompts
  const { data, error } = await supabase
    .from("prompts")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${user?.id || '00000000-0000-0000-0000-000000000000'}`)
    .eq("is_active", true)

  if (error) {
    return []
  }

  return data || []
}
