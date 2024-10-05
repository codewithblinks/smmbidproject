const createPw = document.querySelector("#password"),
 confirmPw = document.querySelector("#confirmPassword"),
 alertIcon = document.querySelector(".error"),
 alertText= document.querySelector(".text1"),
 submitBtn = document.querySelector("#button");


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