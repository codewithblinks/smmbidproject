const createPw = document.querySelector("#create_pw"),
 confirmPw = document.querySelector("#confirm_pw"),
 alertIcon = document.querySelector(".error"),
 alertText= document.querySelector(".text1"),
 submitBtn = document.querySelector("#button");
 

 createPw.addEventListener("input", ()=>{
   let val = createPw.value.trim()
   if(val.length >= 8){
     confirmPw.removeAttribute("disabled");
     submitBtn.removeAttribute("disabled");
     submitBtn.classList.add("active");
     alertText.innerText = "";
   }else {
     confirmPw.setAttribute("disabled", true);
     submitBtn.setAttribute("disabled", true);
     submitBtn.classList.remove("active");
     confirmPw.value = "";
     alertText.style.color = "#D93025";
     alertText.innerText = "Enter at least 8 characters";
     alertIcon.style.display = "none";
   }
 });

submitBtn.addEventListener("click", (e)=>{
 if(createPw.value === confirmPw.value){
   alertText.innerText = "Password matched";
   alertIcon.style.display = "none";
   alertText.style.color = "#4070F4";
 }else {
   alertText.innerText = "Password didn't matched";
   alertIcon.style.display = "block";
   alertText.style.color = "#D93025";
   e.preventDefault();
 }
});



